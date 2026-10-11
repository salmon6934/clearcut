import { describe, it, expect } from 'vitest';
import { parseMoneyToMinor, formatMinor, getCurrencyExponent } from '@/lib/engine/money';

describe('Money Engine (lib/engine/money.ts)', () => {
  it('correctly maps currency exponents', () => {
    expect(getCurrencyExponent('INR')).toBe(2);
    expect(getCurrencyExponent('USD')).toBe(2);
    expect(getCurrencyExponent('JPY')).toBe(0);
    expect(getCurrencyExponent('KWD')).toBe(3);
    expect(getCurrencyExponent('UNKNOWN')).toBe(2);
  });

  it('parses valid money strings across different currencies and formats', () => {
    // INR: 1,250.75 -> 125075 paise
    expect(parseMoneyToMinor('1,250.75', 'INR')).toBe(125075);
    expect(parseMoneyToMinor('1250.75', 'INR')).toBe(125075);
    expect(parseMoneyToMinor('₹100', 'INR')).toBe(10000);
    expect(parseMoneyToMinor('100.5', 'INR')).toBe(10050);

    // JPY (exp 0)
    expect(parseMoneyToMinor('5000', 'JPY')).toBe(5000);
    expect(parseMoneyToMinor('¥10,000', 'JPY')).toBe(10000);

    // KWD (exp 3)
    expect(parseMoneyToMinor('1.500', 'KWD')).toBe(1500);
    expect(parseMoneyToMinor('1.5', 'KWD')).toBe(1500);
    expect(parseMoneyToMinor('0.125', 'KWD')).toBe(125);

    // Comma decimal support
    expect(parseMoneyToMinor('50,50', 'EUR')).toBe(5050);
  });

  it('rejects invalid, zero, negative or excessive values', () => {
    expect(parseMoneyToMinor('0', 'INR')).toBeNull();
    expect(parseMoneyToMinor('-50', 'INR')).toBeNull();
    expect(parseMoneyToMinor('abc', 'INR')).toBeNull();
    expect(parseMoneyToMinor('', 'INR')).toBeNull();
    // Exceeding MAX_AMOUNT_MINOR (10^10)
    expect(parseMoneyToMinor('100000000000.00', 'INR')).toBeNull();
  });

  it('formats minor units accurately without floating point error', () => {
    expect(formatMinor(125075, 'INR', 'en-IN')).toBe('₹1,250.75');
    expect(formatMinor(5000, 'JPY')).toBe('¥5,000');
    expect(formatMinor(1500, 'KWD')).toBe('KWD 1.500');
    expect(formatMinor(-10000, 'USD', 'en-US')).toBe('-$100.00');
    expect(formatMinor(0, 'INR')).toBe('₹0.00');
  });
});
