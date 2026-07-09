import { Module } from '@nestjs/common';
import { SmsModule } from '../sms/sms.module';
import { BillingController, DarajaWebhookController } from './billing.controller';
import { BillingService } from './billing.service';
import { DarajaClient } from './daraja.client';
import { RenewalsScheduler } from './renewals.scheduler';

@Module({
  imports: [SmsModule],
  controllers: [BillingController, DarajaWebhookController],
  providers: [DarajaClient, BillingService, RenewalsScheduler],
  exports: [BillingService],
})
export class BillingModule {}
