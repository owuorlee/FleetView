import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TraccarClient } from '../traccar/traccar.client';
import { CreateVehicleDto } from './dto';

@Injectable()
export class VehiclesService {
  private readonly logger = new Logger('Vehicles');

  constructor(
    private readonly prisma: PrismaService,
    private readonly traccar: TraccarClient,
  ) {}

  listForUser(userId: string) {
    return this.prisma.vehicle.findMany({
      where: { ownerUserId: userId },
      include: { device: { include: { simCard: true } }, subscriptions: true },
      orderBy: { createdAt: 'asc' },
    });
  }

  async create(userId: string, dto: CreateVehicleDto) {
    const regPlate = dto.regPlate.toUpperCase().replace(/\s+/g, ' ').trim();

    const [plateTaken, imeiTaken] = await Promise.all([
      this.prisma.vehicle.findUnique({ where: { regPlate } }),
      this.prisma.device.findUnique({ where: { imei: dto.imei } }),
    ]);
    if (plateTaken) throw new ConflictException(`Vehicle ${regPlate} already registered`);
    if (imeiTaken) throw new ConflictException(`Device IMEI ${dto.imei} already registered`);

    const vehicle = await this.prisma.vehicle.create({
      data: {
        regPlate,
        type: dto.type,
        makeModel: dto.makeModel,
        ownerUserId: userId,
        device: {
          create: {
            imei: dto.imei,
            model: dto.deviceModel,
            protocol: dto.protocol,
            status: 'provisioning',
          },
        },
      },
      include: { device: true },
    });

    // Mirror into Traccar (backend is source of truth; Traccar mirror can lag).
    if (this.traccar.enabled) {
      try {
        const traccarDevice = await this.traccar.createDevice(regPlate, dto.imei);
        await this.prisma.device.update({
          where: { id: vehicle.device!.id },
          data: { traccarDeviceId: traccarDevice.id },
        });
        vehicle.device!.traccarDeviceId = traccarDevice.id;
      } catch (err) {
        // Left unmirrored (traccarDeviceId null); a reconciliation sweep re-attempts.
        this.logger.error(
          `Traccar mirror failed for ${regPlate} (${dto.imei}): ${(err as Error).message}`,
        );
      }
    } else {
      this.logger.warn(`Traccar not configured — ${regPlate} registered without mirror`);
    }

    return vehicle;
  }

  async getOwned(userId: string, vehicleId: string) {
    const vehicle = await this.prisma.vehicle.findUnique({
      where: { id: vehicleId },
      include: { device: true },
    });
    if (!vehicle) throw new NotFoundException('Vehicle not found');
    if (vehicle.ownerUserId !== userId) throw new ForbiddenException();
    return vehicle;
  }

  async latestPosition(userId: string, vehicleId: string) {
    const vehicle = await this.getOwned(userId, vehicleId);
    if (!vehicle.device?.traccarDeviceId) {
      return { vehicleId, position: null, reason: 'device_not_live' };
    }
    const position = await this.traccar.latestPosition(vehicle.device.traccarDeviceId);
    if (!position) return { vehicleId, position: null, reason: 'no_fix_yet' };

    return {
      vehicleId,
      position: {
        latitude: position.latitude,
        longitude: position.longitude,
        speedKmh: TraccarClient.speedKmh(position),
        course: position.course,
        fixTime: position.fixTime,
        ignition: position.attributes['ignition'] ?? null,
        batteryVolts: position.attributes['power'] ?? null,
      },
    };
  }
}
