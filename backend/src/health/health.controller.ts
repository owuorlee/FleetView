import { Controller, Get } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TraccarSocketService } from '../traccar/traccar-socket.service';

@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly traccarSocket: TraccarSocketService,
  ) {}

  @Get()
  async check() {
    let db = false;
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      db = true;
    } catch {
      db = false;
    }
    return {
      status: 'ok',
      db,
      traccar: this.traccarSocket.connectionState,
      time: new Date().toISOString(),
    };
  }
}
