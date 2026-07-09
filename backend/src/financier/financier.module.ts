import { Module } from '@nestjs/common';
import { SmsModule } from '../sms/sms.module';
import { TraccarModule } from '../traccar/traccar.module';
import { OrgsModule } from '../orgs/orgs.module';
import { FinancierController, RecoveryController } from './financier.controller';
import { FinancierService } from './financier.service';

@Module({
  imports: [TraccarModule, SmsModule, OrgsModule],
  controllers: [FinancierController, RecoveryController],
  providers: [FinancierService],
})
export class FinancierModule {}
