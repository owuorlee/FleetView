import { Module } from '@nestjs/common';
import { SmsModule } from '../sms/sms.module';
import { TraccarModule } from '../traccar/traccar.module';
import { AlertsController } from './alerts.controller';
import { AlertsService } from './alerts.service';
import { AlertsWorker } from './alerts.worker';

@Module({
  imports: [TraccarModule, SmsModule],
  controllers: [AlertsController],
  providers: [AlertsService, AlertsWorker],
  exports: [AlertsService],
})
export class AlertsModule {}
