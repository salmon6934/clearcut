import { EngineError } from './errors';

export const MAX_AMOUNT_MINOR = 10_000_000_000; // 10^10 minor units

export const CURRENCY_EXPONENTS: Record<string, number> = {
  INR: 2,
  USD: 2,
  EUR: 2,
  GBP: 2,
  JPY: 0,
  KWD: 3,
  AED: 2,
  CAD: 2,
  AUD: 2,
  SGD: 2,
};

export const DEFAULT_EXPONENT = 2;

export function getCurrencyExponent(currency: string): number {
  const upper = currency.toUpperCase();
  return CURRENCY_EXPONENTS[upper] ?? DEFAULT_EXPONENT;
}

/**
 * Parses user input string to integer minor units without IEEE-754 floating point.
 * Supports '.' and ',' decimals based on currency exponent.
 * Returns null if invalid, <= 0, or > MAX_AMOUNT_MINOR.
 */
export function parseMoneyToMinor(text: string, currency: string): number | null {
  if (!text || typeof text !== 'string') return null;

  // Trim and strip currency symbols or whitespace
  let clean = text.trim().replace(/^[₹$€£¥\s]+|[₹$€£¥\s]+$/g, '').trim();
  if (!clean) return null;

  const exp = getCurrencyExponent(currency);

  if (exp === 0) {
    // For 0-exponent currencies (e.g. JPY):
    // If there is a '.' with zeros (e.g. 5000.00), strip it; if non-zero decimal, return null
    const dotIdx = clean.lastIndexOf('.');
    if (dotIdx !== -1) {
      const dec = clean.slice(dotIdx + 1);
      if (/^\d+$/.test(dec)) {
        if (Number(dec) !== 0) return null;
        clean = clean.slice(0, dotIdx);
      }
    }
    const cleanDigits = clean.replace(/[,\s]/g, '');
    if (!/^\d+$/.test(cleanDigits)) return null;
    const normalized = cleanDigits.replace(/^0+(?=\d)/, '');
    try {
      const bigVal = BigInt(normalized);
      if (bigVal <= 0n || bigVal > BigInt(MAX_AMOUNT_MINOR)) return null;
      return Number(bigVal);
    } catch {
      return null;
    }
  }

  // Detect decimal separator: find the last occurrence of '.' or ','
  const lastDot = clean.lastIndexOf('.');
  const lastComma = clean.lastIndexOf(',');
  const lastSepIndex = Math.max(lastDot, lastComma);

  let intPartStr = clean;
  let decPartStr = '';

  if (lastSepIndex !== -1) {
    const afterSep = clean.slice(lastSepIndex + 1);
    // Spec: "the last separator is decimal only if followed by <= exponent digits"
    if (afterSep.length > 0 && afterSep.length <= exp && /^\d+$/.test(afterSep)) {
      intPartStr = clean.slice(0, lastSepIndex);
      decPartStr = afterSep;
    }
  }

  // Remove all non-digit grouping characters from integer part (like commas, periods or spaces)
  const cleanIntPart = intPartStr.replace(/[.,\s]/g, '');
  if (!/^\d+$/.test(cleanIntPart)) {
    return null;
  }

  // Pad decimal part to exact exponent length (e.g., .5 -> .50 for exp=2)
  decPartStr = decPartStr.padEnd(exp, '0');

  const combinedStr = `${cleanIntPart}${decPartStr}`;
  const normalizedStr = combinedStr.replace(/^0+(?=\d)/, '');

  try {
    const bigVal = BigInt(normalizedStr);
    if (bigVal <= 0n || bigVal > BigInt(MAX_AMOUNT_MINOR)) {
      return null;
    }
    return Number(bigVal);
  } catch {
    return null;
  }
}

/**
 * Formats integer minor units to localized currency string without floating point inaccuracies.
 */
export function formatMinor(
  minor: number,
  currency: string,
  locale = 'en-IN',
  includeCurrency = true
): string {
  if (!Number.isInteger(minor)) {
    throw new EngineError('VALIDATION_FAILED', `Minor units must be integer, got: ${minor}`);
  }

  const exp = getCurrencyExponent(currency);
  const isNegative = minor < 0;
  const absMinor = Math.abs(minor);

  let formattedNum = '';
  if (exp === 0) {
    formattedNum = new Intl.NumberFormat(locale).format(absMinor);
  } else {
    const factor = Math.pow(10, exp);
    const intPart = Math.floor(absMinor / factor);
    const decPart = (absMinor % factor).toString().padStart(exp, '0');
    const formattedInt = new Intl.NumberFormat(locale).format(intPart);
    formattedNum = `${formattedInt}.${decPart}`;
  }

  const sign = isNegative ? '-' : '';

  if (!includeCurrency) {
    return `${sign}${formattedNum}`;
  }

  const upperCcy = currency.toUpperCase();
  const symbolMap: Record<string, string> = {
    INR: '₹',
    USD: '$',
    EUR: '€',
    GBP: '£',
    JPY: '¥',
    AED: 'AED ',
    KWD: 'KWD ',
  };
  const prefix = symbolMap[upperCcy] ?? `${upperCcy} `;
  return `${sign}${prefix}${formattedNum}`;
}
