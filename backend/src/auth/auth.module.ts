import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { SmsModule } from '../sms/sms.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { OtpStore } from './otp.store';

@Global()
@Module({
  imports: [
    SmsModule,
    JwtModule.registerAsync({
      global: true,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('JWT_SECRET'),
        signOptions: { expiresIn: config.get('JWT_ACCESS_TTL') ?? '15m' },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, OtpStore, JwtAuthGuard],
  exports: [JwtAuthGuard],
})
export class AuthModule {}
