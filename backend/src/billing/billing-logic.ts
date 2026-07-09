// Pure billing rules — unit-testable without a database (spec §7).

export const PLANS: Record<string, { name: string; renewalPriceKsh: number }> = {
  boda_std: { name: 'Boda', renewalPriceKsh: 2500 },
  car_std: { name: 'Car Standard', renewalPriceKsh: 3000 },
  car_premium: { name: 'Car Premium', renewalPriceKsh: 3500 },
  fleet: { name: 'Fleet', renewalPriceKsh: 2750 },
  financier: { name: 'Financier', renewalPriceKsh: 2160 },
};

export const GRACE_DAYS = 14;

/** Uppercase, strip everything non-alphanumeric: "kda 123a" → "KDA123A". */
export function normalizeRef(input: string): string {
  return input.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/** Account reference for an invoice: compact plate + 2-digit year, ≤ 12 chars (Daraja cap). */
export function makeAccountRef(regPlate: string, dueDate: Date, salt = ''): string {
  const yy = String(dueDate.getUTCFullYear() % 100).padStart(2, '0');
  const plate = normalizeRef(regPlate).slice(0, 12 - 2 - salt.length);
  return `${plate}${yy}${salt}`;
}

/** Calendar date in East Africa Time, as a UTC-midnight Date (stable day arithmetic). */
export function eatDate(now: Date = new Date()): Date {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Nairobi',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return new Date(`${fmt.format(now)}T00:00:00Z`);
}

export function daysUntil(target: Date, today: Date): number {
  const targetDay = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth(), target.getUTCDate()),
  );
  return Math.round((targetDay.getTime() - today.getTime()) / 86_400_000);
}

export type ReminderStage = 'T7' | 'T1' | 'EXPIRY' | null;

/** Which renewal reminder (if any) fires today. Daily cron ⇒ each stage fires exactly once. */
export function reminderStage(periodEnd: Date, today: Date): ReminderStage {
  const days = daysUntil(periodEnd, today);
  if (days === 7) return 'T7';
  if (days === 1) return 'T1';
  if (days === 0) return 'EXPIRY';
  return null;
}

export type SubscriptionTransition = 'to_grace' | 'to_suspended' | null;

/** State machine step (active → grace → suspended) for an unpaid subscription. */
export function subscriptionTransition(
  status: string,
  periodEnd: Date,
  today: Date,
): SubscriptionTransition {
  const overdueDays = -daysUntil(periodEnd, today);
  if (status === 'active' && overdueDays > 0) return 'to_grace';
  if (status === 'grace' && overdueDays > GRACE_DAYS) return 'to_suspended';
  return null;
}

export interface OpenInvoiceLike {
  id: string;
  accountRef: string;
  amountKsh: number;
  vehiclePlate: string;
  payerPhones: string[]; // phones allowed to pay this invoice (owner)
}

export interface C2bPaymentLike {
  billRef: string;
  amountKsh: number;
  payerPhone: string;
}

export type MatchResult =
  | { matched: true; invoiceId: string; matchedBy: 'account_ref' | 'plate' | 'phone' }
  | { matched: false };

/**
 * C2B reconciliation (spec §7.3): exact account ref → plate alias → payer phone
 * with exactly one open invoice of matching amount → unmatched queue.
 */
export function matchC2bPayment(
  payment: C2bPaymentLike,
  openInvoices: OpenInvoiceLike[],
): MatchResult {
  const ref = normalizeRef(payment.billRef);

  const byRef = openInvoices.find((i) => normalizeRef(i.accountRef) === ref);
  if (byRef) return { matched: true, invoiceId: byRef.id, matchedBy: 'account_ref' };

  const byPlate = openInvoices.filter((i) => normalizeRef(i.vehiclePlate) === ref);
  if (byPlate.length === 1) {
    return { matched: true, invoiceId: byPlate[0].id, matchedBy: 'plate' };
  }

  const byPhone = openInvoices.filter(
    (i) => i.payerPhones.includes(payment.payerPhone) && i.amountKsh === payment.amountKsh,
  );
  if (byPhone.length === 1) {
    return { matched: true, invoiceId: byPhone[0].id, matchedBy: 'phone' };
  }

  return { matched: false };
}
