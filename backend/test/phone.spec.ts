import { describe, expect, it } from 'vitest';
import { InvalidPhoneError, normalizePhone } from '../src/common/phone';

describe('normalizePhone', () => {
  it.each([
    ['0712345678', '254712345678'],
    ['+254712345678', '254712345678'],
    ['254712345678', '254712345678'],
    ['712345678', '254712345678'],
    ['0712 345 678', '254712345678'],
    ['0712-345-678', '254712345678'],
    ['0110123456', '254110123456'], // 01XX Safaricom range
    ['+254 110 123456', '254110123456'],
  ])('normalizes %s → %s', (input, expected) => {
    expect(normalizePhone(input)).toBe(expected);
  });

  it.each([
    '0612345678', // not a Kenyan mobile prefix
    '07123456', // too short
    '07123456789', // too long
    '25571234567', // Tanzania
    'abc',
    '+2547one2345678',
    '',
  ])('rejects %s', (input) => {
    expect(() => normalizePhone(input)).toThrow(InvalidPhoneError);
  });
});
