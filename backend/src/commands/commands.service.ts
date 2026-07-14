import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { CommandStatus } from '@prisma/client';
import { OtpStore } from '../auth/otp.store';
import { PrismaService } from '../prisma/prisma.service';
import { SMS_PROVIDER, SmsProvider } from '../sms/sms.provider';
import { TraccarClient, TraccarPosition } from '../traccar/traccar.client';
import { VehiclesService } from '../vehicles/vehicles.service';
import { evaluateSafety } from './safety-gate';
import { dispatchCommand, DispatchChannel } from './command-dispatch';
import {
  DELIVERY_CONFIRM_WINDOW_MIN,
  expectedRelayState,
  relayStateFromAttributes,
} from './command-delivery';

/** A confirmation must arrive within this window or the request expires. */
export const CONFIRM_WINDOW_MIN = 10;

@Injectable()
export class CommandsService {
  private readonly logger = new Logger('Commands');

  constructor(
    private readonly prisma: PrismaService,
    private readonly traccar: TraccarClient,
    private readonly vehicles: VehiclesService,
    private readonly otpStore: OtpStore,
    @Inject(SMS_PROVIDER) private readonly sms: SmsProvider,
  ) {}

  /** Step 1: request an engine cut. Runs the safety gate, records the attempt, sends a confirm OTP. */
  async requestImmobilize(user: { id: string; phone: string }, vehicleId: string, reason: string) {
    const vehicle = await this.vehicles.getOwned(user.id, vehicleId);
    if (!vehicle.device) throw new ConflictException('Vehicle has no tracking device');
    if (!vehicle.device.relayFitted) {
      throw new ConflictException('No cut-off relay fitted on this vehicle');
    }

    const position = await this.getPosition(vehicle.device.traccarDeviceId);
    const verdict = evaluateSafety(position);

    const command = await this.prisma.command.create({
      data: {
        vehicleId: vehicle.id,
        deviceId: vehicle.device.id,
        type: 'engine_cut',
        initiatedById: user.id,
        status: verdict.safe ? 'pending_confirmation' : 'blocked_safety',
        reason,
        positionSnapshot: verdict.snapshot ?? undefined,
      },
    });

    if (!verdict.safe) {
      throw new ConflictException({
        message: 'blocked_safety',
        blockedReason: verdict.reason,
        commandId: command.id,
        snapshot: verdict.snapshot,
      });
    }

    const code = this.otpStore.issue(`cmd:${command.id}`);
    await this.sms.send(
      user.phone,
      `FleetView: confirm ENGINE CUT for ${vehicle.regPlate} with code ${code}. Valid 5 min. Ignore if this was not you.`,
    );

    return { commandId: command.id, status: command.status, snapshot: verdict.snapshot };
  }

  /** Step 2: confirm with the OTP. Re-runs the safety gate, then dispatches (GPRS or SMS fallback). */
  async confirmImmobilize(user: { id: string }, commandId: string, code: string) {
    const command = await this.prisma.command.findUnique({
      where: { id: commandId },
      include: { device: { include: { simCard: true } }, vehicle: true },
    });
    if (!command) throw new NotFoundException('Command not found');
    if (command.initiatedById !== user.id) throw new ForbiddenException();
    if (command.status !== 'pending_confirmation') {
      throw new ConflictException(`Command is ${command.status}, not confirmable`);
    }
    if (Date.now() - command.createdAt.getTime() > CONFIRM_WINDOW_MIN * 60_000) {
      await this.setStatus(commandId, 'expired');
      throw new ConflictException('Confirmation window expired — request again');
    }
    if (this.otpStore.verify(`cmd:${commandId}`, code) !== 'ok') {
      throw new UnauthorizedException('Wrong or expired confirmation code');
    }

    // Fresh safety check at the moment of truth.
    const position = await this.getPosition(command.device.traccarDeviceId);
    const verdict = evaluateSafety(position);
    if (!verdict.safe && verdict.reason === 'moving') {
      await this.setStatus(commandId, 'blocked_safety');
      throw new ConflictException({
        message: 'blocked_safety',
        blockedReason: verdict.reason,
        snapshot: verdict.snapshot,
      });
    }

    const dispatched = await this.dispatch(command.device, 'cut', position);
    const updated = await this.prisma.command.update({
      where: { id: commandId },
      data: {
        status: 'sent',
        channel: dispatched,
        confirmedById: user.id,
        confirmedAt: new Date(),
        positionSnapshot: verdict.snapshot ?? undefined,
      },
    });
    await this.prisma.vehicle.update({
      where: { id: command.vehicleId },
      data: { status: 'immobilized' },
    });
    return updated;
  }

  /** Restore is single-step (safe by nature) but fully audited. */
  async restore(user: { id: string }, vehicleId: string, reason?: string) {
    const vehicle = await this.vehicles.getOwned(user.id, vehicleId);
    if (!vehicle.device) throw new ConflictException('Vehicle has no tracking device');

    const position = await this.getPosition(vehicle.device.traccarDeviceId);
    const device = await this.prisma.device.findUniqueOrThrow({
      where: { id: vehicle.device.id },
      include: { simCard: true },
    });
    const dispatched = await this.dispatch(device, 'restore', position);

    const command = await this.prisma.command.create({
      data: {
        vehicleId: vehicle.id,
        deviceId: vehicle.device.id,
        type: 'engine_restore',
        initiatedById: user.id,
        confirmedById: user.id,
        confirmedAt: new Date(),
        channel: dispatched,
        status: 'sent',
        reason,
      },
    });
    await this.prisma.vehicle.update({
      where: { id: vehicleId },
      data: { status: 'active' },
    });
    return command;
  }

  async get(user: { id: string }, commandId: string) {
    const command = await this.prisma.command.findUnique({
      where: { id: commandId },
      include: { vehicle: { select: { regPlate: true, ownerUserId: true } } },
    });
    if (!command) throw new NotFoundException('Command not found');
    if (command.vehicle.ownerUserId !== user.id) throw new ForbiddenException();
    return command;
  }

  /**
   * Close the audit loop: when a device reports its relay/output state, mark a
   * recently-sent matching command as `delivered`. Driven by the position stream
   * (spec §5 — full audit trail with real device feedback). Returns the updated
   * command, or null if nothing matched.
   */
  async confirmDeliveryFromPosition(
    traccarDeviceId: number,
    attributes: Record<string, unknown> | undefined,
  ) {
    const state = relayStateFromAttributes(attributes);
    if (!state) return null;

    const device = await this.prisma.device.findUnique({ where: { traccarDeviceId } });
    if (!device) return null;

    const type = state === 'cut' ? 'engine_cut' : 'engine_restore';
    const since = new Date(Date.now() - DELIVERY_CONFIRM_WINDOW_MIN * 60_000);
    const command = await this.prisma.command.findFirst({
      where: { deviceId: device.id, type, status: 'sent', confirmedAt: { gte: since } },
      orderBy: { confirmedAt: 'desc' },
    });
    if (!command || expectedRelayState(command.type) !== state) return null;

    const updated = await this.prisma.command.update({
      where: { id: command.id },
      data: { status: 'delivered', deliveredAt: new Date() },
    });
    this.logger.log(`Command ${command.id} (${type}) delivery confirmed by device ${traccarDeviceId}`);
    return updated;
  }

  private async getPosition(traccarDeviceId: number | null): Promise<TraccarPosition | null> {
    if (!traccarDeviceId || !this.traccar.enabled) return null;
    try {
      return await this.traccar.latestPosition(traccarDeviceId);
    } catch (err) {
      this.logger.warn(`Position lookup failed: ${(err as Error).message}`);
      return null;
    }
  }

  private dispatch(
    device: {
      traccarDeviceId: number | null;
      protocol: import('@prisma/client').DeviceProtocol;
      simCard: { msisdn: string } | null;
    },
    action: 'cut' | 'restore',
    position: TraccarPosition | null,
  ): Promise<DispatchChannel> {
    return dispatchCommand({ traccar: this.traccar, sms: this.sms }, device, action, position);
  }

  private setStatus(commandId: string, status: CommandStatus) {
    return this.prisma.command.update({ where: { id: commandId }, data: { status } });
  }
}
