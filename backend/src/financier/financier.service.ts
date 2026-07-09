import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { CommandChannel, Prisma, RepaymentStatus } from '@prisma/client';
import { randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { SMS_PROVIDER, SmsProvider } from '../sms/sms.provider';
import { TraccarClient } from '../traccar/traccar.client';
import { evaluateSafety } from '../commands/safety-gate';
import { dispatchCommand } from '../commands/command-dispatch';

/** Default arrears threshold (days) at which a loan is auto-flagged for review. */
export const DEFAULT_FLAG_ARREARS_DAYS = 14;
export const RECOVERY_LINK_TTL_HOURS = 72;

export interface RepaymentImportRow {
  externalRef: string;
  repaymentStatus: RepaymentStatus;
  daysInArrears: number;
  nextDueDate?: string;
}

export type SafetyVerdictLabel = 'stationary' | 'moving' | 'offline';

@Injectable()
export class FinancierService {
  private readonly logger = new Logger('Financier');

  constructor(
    private readonly prisma: PrismaService,
    private readonly traccar: TraccarClient,
    @Inject(SMS_PROVIDER) private readonly sms: SmsProvider,
  ) {}

  /** Link a vehicle to a financier org + borrower as loan collateral. */
  async linkLoan(
    orgId: string,
    input: { vehicleId: string; borrowerPhone: string; externalRef: string },
  ) {
    const org = await this.prisma.organization.findUnique({ where: { id: orgId } });
    if (!org || org.type !== 'financier') {
      throw new ConflictException('Organization is not a financier');
    }
    const vehicle = await this.prisma.vehicle.findUnique({
      where: { id: input.vehicleId },
      include: { loan: true },
    });
    if (!vehicle) throw new NotFoundException('Vehicle not found');
    if (vehicle.loan) throw new ConflictException('Vehicle already has a loan link');

    const borrower = await this.prisma.user.findUnique({
      where: { phone: input.borrowerPhone },
    });
    if (!borrower) throw new NotFoundException('Borrower has no FleetView account yet');

    return this.prisma.loan.create({
      data: {
        financierOrgId: orgId,
        vehicleId: input.vehicleId,
        borrowerUserId: borrower.id,
        externalRef: input.externalRef,
      },
    });
  }

  /** Batch upsert repayment statuses from the financier's LMS (CSV/JSON import). */
  async importRepayments(orgId: string, rows: RepaymentImportRow[]) {
    let updated = 0;
    const notFound: string[] = [];
    for (const row of rows) {
      const res = await this.prisma.loan.updateMany({
        where: { financierOrgId: orgId, externalRef: row.externalRef },
        data: {
          repaymentStatus: row.repaymentStatus,
          daysInArrears: row.daysInArrears,
          nextDueDate: row.nextDueDate ? new Date(row.nextDueDate) : undefined,
        },
      });
      if (res.count > 0) updated += res.count;
      else notFound.push(row.externalRef);
    }
    return { updated, notFound };
  }

  /** Portfolio summary: totals, online %, arrears buckets, immobilized count. */
  async portfolio(orgId: string) {
    const loans = await this.prisma.loan.findMany({
      where: { financierOrgId: orgId },
      include: { vehicle: { include: { device: true } } },
    });

    const buckets = { current: 0, arrears_1_7: 0, arrears_8_30: 0, arrears_30_plus: 0 };
    let immobilized = 0;
    let inRecovery = 0;
    let online = 0;

    for (const loan of loans) {
      const d = loan.daysInArrears;
      if (loan.repaymentStatus === 'current' || d <= 0) buckets.current++;
      else if (d <= 7) buckets.arrears_1_7++;
      else if (d <= 30) buckets.arrears_8_30++;
      else buckets.arrears_30_plus++;

      if (loan.vehicle.status === 'immobilized') immobilized++;
      if (loan.vehicle.status === 'in_recovery') inRecovery++;

      // Online = fresh position available. Best-effort; skipped if Traccar down.
      if (loan.vehicle.device?.traccarDeviceId && this.traccar.enabled) {
        try {
          const pos = await this.traccar.latestPosition(loan.vehicle.device.traccarDeviceId);
          if (pos && Date.now() - new Date(pos.fixTime).getTime() < 24 * 3600_000) online++;
        } catch {
          /* ignore */
        }
      }
    }

    return {
      totalUnits: loans.length,
      onlinePct: loans.length ? Math.round((online / loans.length) * 100) : 0,
      arrears: buckets,
      immobilized,
      inRecovery,
    };
  }

  /** Defaulters queue: loans at/over the arrears threshold, each with a safety verdict. */
  async defaulters(orgId: string, thresholdDays = DEFAULT_FLAG_ARREARS_DAYS) {
    const loans = await this.prisma.loan.findMany({
      where: { financierOrgId: orgId, daysInArrears: { gte: thresholdDays } },
      include: { vehicle: { include: { device: true } }, borrower: { select: { phone: true } } },
      orderBy: { daysInArrears: 'desc' },
    });

    return Promise.all(
      loans.map(async (loan) => {
        const verdict = await this.safetyLabel(loan.vehicle.device?.traccarDeviceId ?? null);
        return {
          loanId: loan.id,
          externalRef: loan.externalRef,
          vehicleId: loan.vehicleId,
          regPlate: loan.vehicle.regPlate,
          daysInArrears: loan.daysInArrears,
          vehicleStatus: loan.vehicle.status,
          immobilizationFlag: loan.immobilizationFlag,
          safetyVerdict: verdict,
        };
      }),
    );
  }

  /**
   * Step 1 (batch): flag defaulters for immobilization review. Creates command rows
   * in pending_confirmation. NEVER dispatches — a human confirms in step 2 (spec §4.1).
   */
  async batchFlag(orgId: string, userId: string, loanIds: string[]) {
    const loans = await this.prisma.loan.findMany({
      where: { id: { in: loanIds }, financierOrgId: orgId },
      include: { vehicle: { include: { device: true } } },
    });

    const flagged: string[] = [];
    const skipped: { loanId: string; reason: string }[] = [];
    for (const loan of loans) {
      if (!loan.vehicle.device) {
        skipped.push({ loanId: loan.id, reason: 'no_device' });
        continue;
      }
      if (!loan.vehicle.device.relayFitted) {
        skipped.push({ loanId: loan.id, reason: 'no_relay' });
        continue;
      }
      await this.prisma.$transaction([
        this.prisma.command.create({
          data: {
            vehicleId: loan.vehicleId,
            deviceId: loan.vehicle.device.id,
            type: 'engine_cut',
            initiatedById: userId,
            status: 'pending_confirmation',
            reason: `Loan default: ${loan.daysInArrears}d arrears (ref ${loan.externalRef})`,
          },
        }),
        this.prisma.loan.update({
          where: { id: loan.id },
          data: { immobilizationFlag: 'flagged', flagUpdatedAt: new Date() },
        }),
      ]);
      flagged.push(loan.id);
    }
    return { flagged, skipped };
  }

  /**
   * Step 2 (batch): a named human confirms a reviewed flag list. Each unit is
   * re-checked against the safety gate at dispatch time; moving units are blocked
   * and stay queued.
   */
  async batchConfirm(orgId: string, userId: string, loanIds: string[], reason: string) {
    const loans = await this.prisma.loan.findMany({
      where: { id: { in: loanIds }, financierOrgId: orgId, immobilizationFlag: 'flagged' },
      include: { vehicle: { include: { device: { include: { simCard: true } } } } },
    });

    const results: { loanId: string; outcome: string; channel?: string }[] = [];
    for (const loan of loans) {
      const device = loan.vehicle.device;
      if (!device) {
        results.push({ loanId: loan.id, outcome: 'no_device' });
        continue;
      }

      const position = device.traccarDeviceId
        ? await this.traccar.latestPosition(device.traccarDeviceId).catch(() => null)
        : null;
      const verdict = evaluateSafety(position);

      // Block only when actively moving; offline/stale still dispatch via SMS fallback.
      if (!verdict.safe && verdict.reason === 'moving') {
        await this.updateLatestCommand(loan.vehicleId, userId, 'blocked_safety', reason);
        results.push({ loanId: loan.id, outcome: 'blocked_moving' });
        continue;
      }

      try {
        const channel = await dispatchCommand(
          { traccar: this.traccar, sms: this.sms },
          device,
          'cut',
          position,
        );
        await this.prisma.$transaction([
          this.updateLatestCommandTx(loan.vehicleId, userId, 'sent', reason, channel),
          this.prisma.vehicle.update({
            where: { id: loan.vehicleId },
            data: { status: 'immobilized' },
          }),
          this.prisma.loan.update({
            where: { id: loan.id },
            data: { immobilizationFlag: 'immobilized', flagUpdatedAt: new Date() },
          }),
        ]);
        results.push({ loanId: loan.id, outcome: 'immobilized', channel });
      } catch (err) {
        this.logger.error(`Batch confirm ${loan.id} failed: ${(err as Error).message}`);
        results.push({ loanId: loan.id, outcome: 'dispatch_failed' });
      }
    }
    return { results };
  }

  /** Create an expiring, revocable public live-location link for recovery agents/police. */
  async createRecoveryLink(orgId: string, userId: string, vehicleId: string) {
    const loan = await this.prisma.loan.findFirst({
      where: { vehicleId, financierOrgId: orgId },
    });
    if (!loan) throw new NotFoundException('No loan for that vehicle in this organization');

    const token = randomBytes(24).toString('hex');
    const link = await this.prisma.recoveryLink.create({
      data: {
        vehicleId,
        createdById: userId,
        token,
        expiresAt: new Date(Date.now() + RECOVERY_LINK_TTL_HOURS * 3600_000),
      },
    });
    await this.prisma.vehicle.update({ where: { id: vehicleId }, data: { status: 'in_recovery' } });
    return { token, expiresAt: link.expiresAt, path: `/v1/recovery/${token}` };
  }

  /** Public, unauthenticated: resolve a recovery token to a live position. */
  async resolveRecoveryLink(token: string) {
    const link = await this.prisma.recoveryLink.findUnique({
      where: { token },
      include: { vehicle: { include: { device: true } } },
    });
    if (!link || link.status !== 'active' || link.expiresAt < new Date()) {
      throw new NotFoundException('Link expired or invalid');
    }
    const traccarId = link.vehicle.device?.traccarDeviceId ?? null;
    const pos =
      traccarId && this.traccar.enabled
        ? await this.traccar.latestPosition(traccarId).catch(() => null)
        : null;
    return {
      regPlate: link.vehicle.regPlate,
      position: pos
        ? {
            latitude: pos.latitude,
            longitude: pos.longitude,
            speedKmh: TraccarClient.speedKmh(pos),
            fixTime: pos.fixTime,
          }
        : null,
      expiresAt: link.expiresAt,
    };
  }

  private async safetyLabel(traccarDeviceId: number | null): Promise<SafetyVerdictLabel> {
    if (!traccarDeviceId || !this.traccar.enabled) return 'offline';
    const pos = await this.traccar.latestPosition(traccarDeviceId).catch(() => null);
    const verdict = evaluateSafety(pos);
    if (verdict.safe) return 'stationary';
    return verdict.reason === 'moving' ? 'moving' : 'offline';
  }

  private async updateLatestCommand(
    vehicleId: string,
    userId: string,
    status: 'blocked_safety' | 'sent',
    reason: string,
  ) {
    await this.prisma.$transaction([
      this.updateLatestCommandTx(vehicleId, userId, status, reason),
    ]);
  }

  /** Build the update for the most recent pending command on a vehicle. */
  private updateLatestCommandTx(
    vehicleId: string,
    userId: string,
    status: 'blocked_safety' | 'sent',
    reason: string,
    channel?: CommandChannel,
  ): Prisma.PrismaPromise<Prisma.BatchPayload> {
    return this.prisma.command.updateMany({
      where: { vehicleId, type: 'engine_cut', status: 'pending_confirmation' },
      data: {
        status,
        confirmedById: userId,
        confirmedAt: new Date(),
        reason,
        ...(channel ? { channel } : {}),
      },
    });
  }
}
