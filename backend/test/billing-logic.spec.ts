import { describe, expect, it } from 'vitest';
import {
  daysUntil,
  eatDate,
  makeAccountRef,
  matchC2bPayment,
  normalizeRef,
  reminderStage,
  subscriptionTransition,
} from '../src/billing/billing-logic';
import { darajaPassword, darajaTimestamp } from '../src/billing/daraja.client';

describe('normalizeRef / makeAccountRef', () => {
  it('normalizes plates and refs', () => {
    expect(normalizeRef('kda 123a')).toBe('KDA123A');
    expect(normalizeRef(' KMFB-421C ')).toBe('KMFB421C');
  });

  it('builds a ≤12-char account ref with year suffix', () => {
    const ref = makeAccountRef('KDA 123A', new Date('2027-07-01T00:00:00Z'));
    expect(ref).toBe('KDA123A27');
    expect(ref.length).toBeLessThanOrEqual(12);
  });

  it('truncates long plates instead of exceeding 12 chars', () => {
    const ref = makeAccountRef('KMFB 421C EXTRA', new Date('2027-07-01T00:00:00Z'), 'X');
    expect(ref.length).toBeLessThanOrEqual(12);
    expect(ref.endsWith('27X')).toBe(true);
  });
});

describe('reminder stages and transitions', () => {
  const end = new Date('2026-07-15T10:30:00Z');

  it('fires T-7, T-1 and expiry exactly on their days', () => {
    expect(reminderStage(end, new Date('2026-07-08T00:00:00Z'))).toBe('T7');
    expect(reminderStage(end, new Date('2026-07-14T00:00:00Z'))).toBe('T1');
    expect(reminderStage(end, new Date('2026-07-15T00:00:00Z'))).toBe('EXPIRY');
    expect(reminderStage(end, new Date('2026-07-10T00:00:00Z'))).toBeNull();
    expect(reminderStage(end, new Date('2026-07-16T00:00:00Z'))).toBeNull();
  });

  it('moves active → grace the day after expiry', () => {
    expect(subscriptionTransition('active', end, new Date('2026-07-15T00:00:00Z'))).toBeNull();
    expect(subscriptionTransition('active', end, new Date('2026-07-16T00:00:00Z'))).toBe('to_grace');
  });

  it('moves grace → suspended after 14 days', () => {
    expect(subscriptionTransition('grace', end, new Date('2026-07-29T00:00:00Z'))).toBeNull();
    expect(subscriptionTransition('grace', end, new Date('2026-07-30T00:00:00Z'))).toBe(
      'to_suspended',
    );
  });

  it('eatDate/daysUntil are stable across the EAT midnight boundary', () => {
    // 21:30 UTC = 00:30 EAT next day
    const today = eatDate(new Date('2026-07-07T21:30:00Z'));
    expect(today.toISOString().slice(0, 10)).toBe('2026-07-08');
    expect(daysUntil(new Date('2026-07-15T00:00:00Z'), today)).toBe(7);
  });
});

describe('matchC2bPayment', () => {
  const invoices = [
    {
      id: 'i1',
      accountRef: 'KDA123A26',
      amountKsh: 3000,
      vehiclePlate: 'KDA 123A',
      payerPhones: ['254712345678'],
    },
    {
      id: 'i2',
      accountRef: 'KMFB421C26',
      amountKsh: 2500,
      vehiclePlate: 'KMFB 421C',
      payerPhones: ['254799888777'],
    },
  ];

  it('matches by exact account ref (case/space-insensitive)', () => {
    expect(
      matchC2bPayment({ billRef: 'kda123a26', amountKsh: 3000, payerPhone: '254700000000' }, invoices),
    ).toEqual({ matched: true, invoiceId: 'i1', matchedBy: 'account_ref' });
  });

  it('falls back to the plate alias', () => {
    expect(
      matchC2bPayment({ billRef: 'KMFB 421C', amountKsh: 2500, payerPhone: '254700000000' }, invoices),
    ).toEqual({ matched: true, invoiceId: 'i2', matchedBy: 'plate' });
  });

  it('falls back to payer phone + exact amount when the ref is garbage', () => {
    expect(
      matchC2bPayment({ billRef: 'JOHN', amountKsh: 2500, payerPhone: '254799888777' }, invoices),
    ).toEqual({ matched: true, invoiceId: 'i2', matchedBy: 'phone' });
  });

  it('does not phone-match on a wrong amount, goes unmatched', () => {
    expect(
      matchC2bPayment({ billRef: 'JOHN', amountKsh: 1000, payerPhone: '254799888777' }, invoices),
    ).toEqual({ matched: false });
  });

  it('goes unmatched when the phone could pay two invoices of the same amount', () => {
    const ambiguous = [
      { ...invoices[0], amountKsh: 2500, payerPhones: ['254799888777'] },
      invoices[1],
    ];
    expect(
      matchC2bPayment({ billRef: '?', amountKsh: 2500, payerPhone: '254799888777' }, ambiguous),
    ).toEqual({ matched: false });
  });
});

describe('daraja helpers', () => {
  it('formats the timestamp as yyyyMMddHHmmss in EAT', () => {
    // 2026-07-08 21:05:09 UTC = 2026-07-09 00:05:09 EAT
    expect(darajaTimestamp(new Date('2026-07-08T21:05:09Z'))).toBe('20260709000509');
  });

  it('builds the base64 password', () => {
    const password = darajaPassword('174379', 'passkey', '20260709000509');
    expect(Buffer.from(password, 'base64').toString()).toBe('174379passkey20260709000509');
  });
});
