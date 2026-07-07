import { describe, expect, it } from 'vitest';
import {
  OTP_MAX_ATTEMPTS,
  OTP_RESEND_COOLDOWN_MS,
  OTP_TTL_MS,
  OtpCooldownError,
  OtpStore,
} from '../src/auth/otp.store';

const PHONE = '254712345678';

describe('OtpStore', () => {
  it('issues a 6-digit code and verifies it once', () => {
    const store = new OtpStore();
    const code = store.issue(PHONE);
    expect(code).toMatch(/^\d{6}$/);
    expect(store.verify(PHONE, code)).toBe('ok');
    // single use: second verify fails
    expect(store.verify(PHONE, code)).toBe('invalid');
  });

  it('rejects wrong codes and locks after max attempts', () => {
    const store = new OtpStore();
    store.issue(PHONE);
    for (let i = 1; i < OTP_MAX_ATTEMPTS; i++) {
      expect(store.verify(PHONE, '000000')).toBe('invalid');
    }
    expect(store.verify(PHONE, '000000')).toBe('locked');
    expect(store.verify(PHONE, '000000')).toBe('locked');
  });

  it('expires codes after TTL', () => {
    const store = new OtpStore();
    const t0 = Date.now();
    const code = store.issue(PHONE, t0);
    expect(store.verify(PHONE, code, t0 + OTP_TTL_MS + 1)).toBe('expired');
  });

  it('enforces resend cooldown, then allows reissue', () => {
    const store = new OtpStore();
    const t0 = Date.now();
    store.issue(PHONE, t0);
    expect(() => store.issue(PHONE, t0 + OTP_RESEND_COOLDOWN_MS - 1)).toThrow(OtpCooldownError);
    const second = store.issue(PHONE, t0 + OTP_RESEND_COOLDOWN_MS + 1);
    expect(second).toMatch(/^\d{6}$/);
  });

  it('reissuing invalidates the previous code', () => {
    const store = new OtpStore();
    const t0 = Date.now();
    const first = store.issue(PHONE, t0);
    const second = store.issue(PHONE, t0 + OTP_RESEND_COOLDOWN_MS + 1);
    expect(store.verify(PHONE, first)).toBe(first === second ? 'ok' : 'invalid');
    if (first !== second) {
      expect(store.verify(PHONE, second)).toBe('ok');
    }
  });
});
