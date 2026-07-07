import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { TraccarModule } from '../traccar/traccar.module';

@Module({
  imports: [TraccarModule],
  controllers: [HealthController],
})
export class HealthModule {}
