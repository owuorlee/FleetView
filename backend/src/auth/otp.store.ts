import { Injectable } from '@nestjs/common';
import { createHash, randomInt } from 'crypto';

export const OTP_TTL_MS = 5 * 60 * 1000;
export const OTP_MAX_ATTEMPTS = 3;
export const OTP_RESEND_COOLDOWN_MS = 60 * 1000;

interface OtpEntry {
  codeHash: string;
  expiresAt: number;
  attemptsLeft: number;
  lastSentAt: number;
}

export type OtpVerifyResult = 'ok' | 'invalid' | 'expired' | 'locked';

function hash(code: string): string {
  return createHash('sha256').update(code).digest('hex');
}

/**
 * In-memory OTP store — sufficient for the single-node v1 deployment.
 * Swap for Redis when the backend goes multi-node.
 */
@Injectable()
export class OtpStore {
  private readonly entries = new Map<string, OtpEntry>();

  /** Returns the code to send, or throws CooldownError if resent too soon. */
  issue(phone: string, now = Date.now()): string {
    const existing = this.entries.get(phone);
    if (existing && now - existing.lastSentAt < OTP_RESEND_COOLDOWN_MS) {
      const waitMs = OTP_RESEND_COOLDOWN_MS - (now - existing.lastSentAt);
      throw new OtpCooldownError(Math.ceil(waitMs / 1000));
    }
    const code = randomInt(0, 1_000_000).toString().padStart(6, '0');
    this.entries.set(phone, {
      codeHash: hash(code),
      expiresAt: now + OTP_TTL_MS,
      attemptsLeft: OTP_MAX_ATTEMPTS,
      lastSentAt: now,
    });
    return code;
  }

  verify(phone: string, code: string, now = Date.now()): OtpVerifyResult {
    const entry = this.entries.get(phone);
    if (!entry) return 'invalid';
    if (now > entry.expiresAt) {
      this.entries.delete(phone);
      return 'expired';
    }
    if (entry.attemptsLeft <= 0) return 'locked';
    if (entry.codeHash !== hash(code)) {
      entry.attemptsLeft -= 1;
      return entry.attemptsLeft <= 0 ? 'locked' : 'invalid';
    }
    this.entries.delete(phone); // single use
    return 'ok';
  }
}

export class OtpCooldownError extends Error {
  constructor(public readonly retryAfterSeconds: number) {
    super(`OTP recently sent; retry in ${retryAfterSeconds}s`);
    this.name = 'OtpCooldownError';
  }
}
