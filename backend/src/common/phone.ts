// Kenyan mobile numbers: Safaricom et al. use 07XX and 01XX ranges.
// Canonical storage/M-Pesa format: 2547XXXXXXXX or 2541XXXXXXXX.
const KENYA_MOBILE = /^254[71]\d{8}$/;

export class InvalidPhoneError extends Error {
  constructor(input: string) {
    super(`Not a valid Kenyan mobile number: ${input}`);
    this.name = 'InvalidPhoneError';
  }
}

export function normalizePhone(input: string): string {
  const digits = input.replace(/[\s\-().]/g, '').replace(/^\+/, '');
  if (!/^\d+$/.test(digits)) throw new InvalidPhoneError(input);

  let candidate: string;
  if (digits.startsWith('254')) candidate = digits;
  else if (digits.startsWith('0')) candidate = `254${digits.slice(1)}`;
  else if (digits.startsWith('7') || digits.startsWith('1')) candidate = `254${digits}`;
  else candidate = digits;

  if (!KENYA_MOBILE.test(candidate)) throw new InvalidPhoneError(input);
  return candidate;
}
