import {
  HttpException,
  Inject,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { SMS_PROVIDER, SmsProvider } from '../sms/sms.provider';
import { normalizePhone } from '../common/phone';
import { OtpCooldownError, OtpStore } from './otp.store';

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger('Auth');

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly otpStore: OtpStore,
    @Inject(SMS_PROVIDER) private readonly sms: SmsProvider,
  ) {}

  async requestOtp(rawPhone: string): Promise<{ sent: boolean }> {
    const phone = normalizePhone(rawPhone);
    let code: string;
    try {
      code = this.otpStore.issue(phone);
    } catch (err) {
      if (err instanceof OtpCooldownError) {
        throw new HttpException(
          { message: 'OTP recently sent', retryAfterSeconds: err.retryAfterSeconds },
          429,
        );
      }
      throw err;
    }
    await this.sms.send(phone, `FleetView code: ${code}. Valid for 5 minutes. Usitume kwa mtu yeyote.`);
    return { sent: true };
  }

  async verifyOtp(rawPhone: string, code: string, fullName?: string): Promise<AuthTokens> {
    const phone = normalizePhone(rawPhone);
    const result = this.otpStore.verify(phone, code);
    if (result !== 'ok') {
      throw new UnauthorizedException(
        result === 'expired' ? 'Code expired — request a new one' : 'Wrong code',
      );
    }

    const user = await this.prisma.user.upsert({
      where: { phone },
      create: { phone, fullName, consentAcceptedAt: new Date() },
      update: fullName ? { fullName } : {},
    });

    return this.issueTokens(user.id, user.phone);
  }

  async refresh(refreshToken: string): Promise<AuthTokens> {
    const tokenHash = sha256(refreshToken);
    const stored = await this.prisma.refreshToken.findUnique({ where: { tokenHash } });
    if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
      throw new UnauthorizedException('Invalid refresh token');
    }
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: stored.userId } });

    // Rotate: revoke old, issue new
    await this.prisma.refreshToken.update({
      where: { tokenHash },
      data: { revokedAt: new Date() },
    });
    return this.issueTokens(user.id, user.phone);
  }

  private async issueTokens(userId: string, phone: string): Promise<AuthTokens> {
    const accessToken = await this.jwt.signAsync({ sub: userId, phone });

    const refreshToken = randomBytes(48).toString('hex');
    const ttlDays = Number(this.config.get('JWT_REFRESH_TTL_DAYS') ?? 30);
    await this.prisma.refreshToken.create({
      data: {
        userId,
        tokenHash: sha256(refreshToken),
        expiresAt: new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000),
      },
    });
    return { accessToken, refreshToken };
  }
}
