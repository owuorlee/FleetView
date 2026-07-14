import {
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { AlertType, Prisma } from '@prisma/client';
import { Subject } from 'rxjs';
import { PrismaService } from '../prisma/prisma.service';
import { SMS_PROVIDER, SmsProvider } from '../sms/sms.provider';
import { TraccarClient } from '../traccar/traccar.client';
import { TraccarEvent } from '../traccar/traccar-socket.service';
import { ALERT_TITLES, dedupKey, mapTraccarEvent } from './alert-rules';

export const SMS_DAILY_CAP_PER_VEHICLE = 10;

export interface AlertCreatedEvent {
  alertId: string;
  vehicleId: string;
  type: string;
  severity: string;
  positionSnapshot?: unknown;
}

@Injectable()
export class AlertsService {
  private readonly logger = new Logger('Alerts');

  /** Live feed of newly created alerts, consumed by the client stream gateway. */
  readonly created$ = new Subject<AlertCreatedEvent>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly traccar: TraccarClient,
    @Inject(SMS_PROVIDER) private readonly sms: SmsProvider,
  ) {}

  /** Entry point for the Traccar event stream. Returns the created alert or null if suppressed/ignored. */
  async ingestEvent(event: TraccarEvent) {
    const rule = mapTraccarEvent(event);
    if (!rule) return null;

    const device = await this.prisma.device.findUnique({
      where: { traccarDeviceId: event.deviceId },
      include: { vehicle: { include: { owner: true } } },
    });
    if (!device?.vehicle) {
      this.logger.warn(`Event ${event.type} for unmapped Traccar device ${event.deviceId}`);
      return null;
    }
    const vehicle = device.vehicle;

    const eventTime = event.eventTime ? new Date(event.eventTime) : new Date();
    const key = dedupKey(rule.type, vehicle.id, eventTime, rule.bucketMinutes);

    // Critical alerts carry the last-known position (headline differentiator, spec §6).
    let snapshot: Prisma.InputJsonValue | undefined;
    if (rule.severity === 'critical' && device.traccarDeviceId && this.traccar.enabled) {
      try {
        const pos = await this.traccar.latestPosition(device.traccarDeviceId);
        if (pos) {
          snapshot = {
            latitude: pos.latitude,
            longitude: pos.longitude,
            speedKmh: TraccarClient.speedKmh(pos),
            fixTime: pos.fixTime,
          };
        }
      } catch {
        // position enrichment is best-effort; the alert must still go out
      }
    }

    let alert;
    try {
      alert = await this.prisma.alert.create({
        data: {
          vehicleId: vehicle.id,
          type: rule.type,
          severity: rule.severity,
          traccarEventId: BigInt(event.id),
          positionSnapshot: snapshot,
          dedupKey: key,
        },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        // Same bucket: suppress, count the repeat.
        await this.prisma.alert.update({
          where: { dedupKey: key },
          data: { repeatCount: { increment: 1 } },
        });
        return null;
      }
      throw err;
    }

    this.created$.next({
      alertId: alert.id,
      vehicleId: vehicle.id,
      type: rule.type,
      severity: rule.severity,
      positionSnapshot: snapshot,
    });

    await this.fanOut(alert.id, rule.type, rule.severity === 'critical', vehicle);
    return alert;
  }

  private async fanOut(
    alertId: string,
    type: AlertType,
    critical: boolean,
    vehicle: { id: string; regPlate: string; ownerUserId: string | null; owner: { id: string; phone: string; locale: string } | null },
  ) {
    if (!vehicle.owner) return; // org-owned fan-out lands with the RBAC build

    // In-app inbox delivery — always.
    await this.prisma.notificationDelivery.create({
      data: { alertId, userId: vehicle.owner.id, channel: 'in_app', status: 'delivered' },
    });

    // SMS — critical types only in v1, capped per vehicle per day (critical exempt from cap per spec §6).
    if (!critical) return;

    const title = ALERT_TITLES[type][vehicle.owner.locale === 'sw' ? 'sw' : 'en'];
    const time = new Intl.DateTimeFormat('en-KE', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZone: 'Africa/Nairobi',
    }).format(new Date());
    const message = `FleetView: ${title} ${vehicle.regPlate} · ${time}`;

    const delivery = await this.prisma.notificationDelivery.create({
      data: { alertId, userId: vehicle.owner.id, channel: 'sms', status: 'queued' },
    });
    try {
      await this.sms.send(vehicle.owner.phone, message);
      await this.prisma.notificationDelivery.update({
        where: { id: delivery.id },
        data: { status: 'sent' },
      });
    } catch (err) {
      this.logger.error(`SMS delivery ${delivery.id} failed: ${(err as Error).message}`);
      await this.prisma.notificationDelivery.update({
        where: { id: delivery.id },
        data: { status: 'failed' },
      });
    }
  }

  async listForUser(userId: string, status?: string) {
    return this.prisma.alert.findMany({
      where: {
        vehicle: { ownerUserId: userId },
        ...(status ? { status: status as never } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: { vehicle: { select: { regPlate: true } } },
    });
  }

  async acknowledge(userId: string, alertId: string) {
    const alert = await this.prisma.alert.findUnique({
      where: { id: alertId },
      include: { vehicle: true },
    });
    if (!alert) throw new NotFoundException('Alert not found');
    if (alert.vehicle.ownerUserId !== userId) throw new ForbiddenException();
    return this.prisma.alert.update({
      where: { id: alertId },
      data: { status: 'acknowledged' },
    });
  }
}
