import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { HealthModule } from './health/health.module';
import { SmsModule } from './sms/sms.module';
import { AuthModule } from './auth/auth.module';
import { TraccarModule } from './traccar/traccar.module';
import { VehiclesModule } from './vehicles/vehicles.module';
import { AlertsModule } from './alerts/alerts.module';
import { CommandsModule } from './commands/commands.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    SmsModule,
    AuthModule,
    TraccarModule,
    VehiclesModule,
    AlertsModule,
    CommandsModule,
    HealthModule,
  ],
})
export class AppModule {}
