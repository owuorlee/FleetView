import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { PrismaModule } from './prisma/prisma.module';
import { HealthModule } from './health/health.module';
import { SmsModule } from './sms/sms.module';
import { AuthModule } from './auth/auth.module';
import { TraccarModule } from './traccar/traccar.module';
import { VehiclesModule } from './vehicles/vehicles.module';
import { AlertsModule } from './alerts/alerts.module';
import { CommandsModule } from './commands/commands.module';
import { BillingModule } from './billing/billing.module';
import { OrgsModule } from './orgs/orgs.module';
import { FinancierModule } from './financier/financier.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    PrismaModule,
    SmsModule,
    AuthModule,
    TraccarModule,
    VehiclesModule,
    AlertsModule,
    CommandsModule,
    BillingModule,
    OrgsModule,
    FinancierModule,
    HealthModule,
  ],
})
export class AppModule {}
