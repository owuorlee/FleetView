import { describe, expect, it, vi } from 'vitest';
import { AuthService } from '../src/auth/auth.service';
import { OtpStore } from '../src/auth/otp.store';

const PHONE = '254712345678';

function build() {
  const prisma = {
    user: {
      upsert: vi.fn().mockResolvedValue({ id: 'u1', phone: PHONE }),
      findUniqueOrThrow: vi.fn().mockResolvedValue({ id: 'u1', phone: PHONE }),
    },
    refreshToken: {
      create: vi.fn().mockResolvedValue({}),
      findUnique: vi.fn(),
      update: vi.fn().mockResolvedValue({}),
    },
  };
  const jwt = { signAsync: vi.fn().mockResolvedValue('signed.jwt') };
  const config = { get: vi.fn().mockReturnValue(30) };
  const sms = { send: vi.fn().mockResolvedValue(undefined) };
  const otpStore = new OtpStore();
  const service = new AuthService(
    prisma as never,
    jwt as never,
    config as never,
    otpStore,
    sms,
  );
  return { service, prisma, jwt, sms, otpStore };
}

describe('AuthService', () => {
  it('requestOtp normalizes the phone and sends the code by SMS', async () => {
    const { service, sms } = build();
    const result = await service.requestOtp('0712 345 678');
    expect(result).toEqual({ sent: true });
    expect(sms.send).toHaveBeenCalledTimes(1);
    const [to, message] = sms.send.mock.calls[0];
    expect(to).toBe(PHONE);
    expect(message).toMatch(/\d{6}/);
  });

  it('verifyOtp upserts the user and returns both tokens', async () => {
    const { service, sms, prisma } = build();
    await service.requestOtp(PHONE);
    const code = (sms.send.mock.calls[0][1] as string).match(/\d{6}/)![0];

    const tokens = await service.verifyOtp('0712345678', code, 'Leslie O');
    expect(tokens.accessToken).toBe('signed.jwt');
    expect(tokens.refreshToken).toMatch(/^[0-9a-f]{96}$/);
    expect(prisma.user.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { phone: PHONE } }),
    );
    expect(prisma.refreshToken.create).toHaveBeenCalledTimes(1);
  });

  it('verifyOtp rejects a wrong code', async () => {
    const { service } = build();
    await service.requestOtp(PHONE);
    await expect(service.verifyOtp(PHONE, '000000')).rejects.toThrow('Wrong code');
  });

  it('refresh rejects unknown tokens', async () => {
    const { service, prisma } = build();
    prisma.refreshToken.findUnique.mockResolvedValue(null);
    await expect(service.refresh('nope')).rejects.toThrow('Invalid refresh token');
  });

  it('refresh rotates a valid token', async () => {
    const { service, prisma } = build();
    prisma.refreshToken.findUnique.mockResolvedValue({
      userId: 'u1',
      revokedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
    });
    const tokens = await service.refresh('valid-token');
    expect(tokens.accessToken).toBe('signed.jwt');
    expect(prisma.refreshToken.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { revokedAt: expect.any(Date) } }),
    );
  });
});
