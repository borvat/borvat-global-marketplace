/**
 * Money is always an integer count of minor units (cents), never a float.
 * Currency precision follows ISO 4217, so JPY has 0 minor units and EUR has 2.
 */

import { validation } from './errors.ts';

export const MINOR_UNITS: Readonly<Record<string, number>> = Object.freeze({
  EUR: 2,
  USD: 2,
  GBP: 2,
  JPY: 0,
  SYP: 2,
  TRY: 2,
  AED: 2,
  SAR: 2,
  SEK: 2,
  PLN: 2,
});

export function normaliseCurrency(currency: string): string {
  const code = currency.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(code)) throw validation(`invalid currency code: ${currency}`);
  if (MINOR_UNITS[code] === undefined) throw validation(`unsupported currency: ${code}`);
  return code;
}

export function minorUnitsFor(currency: string): number {
  const units = MINOR_UNITS[normaliseCurrency(currency)];
  if (units === undefined) throw validation(`unsupported currency: ${currency}`);
  return units;
}

export function toMinor(value: string | number | bigint): bigint {
  if (typeof value === 'bigint') return value;
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value)) {
      throw validation(`money must be an integer number of minor units, received ${value}`);
    }
    return BigInt(value);
  }
  if (!/^-?\d+$/.test(value.trim())) {
    throw validation(`money must be an integer number of minor units, received ${value}`);
  }
  return BigInt(value.trim());
}

/** Integer division rounded half away from zero. */
export function roundHalfUpDiv(numerator: bigint, denominator: bigint): bigint {
  if (denominator <= 0n) throw validation('denominator must be positive');
  const negative = numerator < 0n;
  const abs = negative ? -numerator : numerator;
  const quotient = (abs * 2n + denominator) / (denominator * 2n);
  return negative ? -quotient : quotient;
}

/**
 * Tax contained in a tax-inclusive price, which is the European consumer convention.
 * gross = net * (1 + rate)  =>  tax = gross * rate / (1 + rate)
 */
export function taxFromInclusive(grossMinor: bigint, rateBps: number): bigint {
  if (!Number.isInteger(rateBps) || rateBps < 0 || rateBps > 4000) {
    throw validation(`invalid tax rate in basis points: ${rateBps}`);
  }
  if (rateBps === 0) return 0n;
  return roundHalfUpDiv(grossMinor * BigInt(rateBps), 10000n + BigInt(rateBps));
}

export function commissionFor(baseMinor: bigint, commissionBps: number): bigint {
  if (!Number.isInteger(commissionBps) || commissionBps < 0 || commissionBps > 5000) {
    throw validation(`invalid commission in basis points: ${commissionBps}`);
  }
  return roundHalfUpDiv(baseMinor * BigInt(commissionBps), 10000n);
}

export function multiply(unitMinor: bigint, quantity: number): bigint {
  if (!Number.isSafeInteger(quantity) || quantity <= 0) {
    throw validation(`invalid quantity: ${quantity}`);
  }
  return unitMinor * BigInt(quantity);
}

export function formatMinor(minor: bigint, currency: string): string {
  const units = minorUnitsFor(currency);
  const negative = minor < 0n;
  const abs = negative ? -minor : minor;
  const padded = abs.toString().padStart(units + 1, '0');
  const whole = units === 0 ? padded : padded.slice(0, -units);
  const fraction = units === 0 ? '' : `.${padded.slice(-units)}`;
  return `${negative ? '-' : ''}${whole}${fraction} ${normaliseCurrency(currency)}`;
}

/** Parses a human decimal string such as "19.95" into minor units. */
export function parseDecimalToMinor(input: string, currency: string): bigint {
  const units = minorUnitsFor(currency);
  const match = /^(-)?(\d+)(?:[.,](\d+))?$/.exec(input.trim());
  if (!match) throw validation(`invalid decimal amount: ${input}`);
  const sign = match[1] === '-' ? -1n : 1n;
  const whole = match[2] ?? '0';
  const fractionRaw = match[3] ?? '';
  if (fractionRaw.length > units) {
    throw validation(`amount ${input} has more precision than ${currency} allows`);
  }
  const fraction = fractionRaw.padEnd(units, '0');
  return sign * (BigInt(whole) * 10n ** BigInt(units) + BigInt(fraction === '' ? '0' : fraction));
}