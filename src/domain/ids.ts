import { randomBytes } from 'node:crypto';

const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

export function randomCode(length: number): string {
  const bytes = randomBytes(length);
  let out = '';
  for (let index = 0; index < length; index += 1) {
    out += ALPHABET[(bytes[index] ?? 0) % ALPHABET.length];
  }
  return out;
}

export function orderNumber(now: Date = new Date()): string {
  const stamp = [
    now.getUTCFullYear(),
    String(now.getUTCMonth() + 1).padStart(2, '0'),
    String(now.getUTCDate()).padStart(2, '0'),
  ].join('');
  return `BRV-${stamp}-${randomCode(6)}`;
}

export function vendorOrderNumber(parentOrderNumber: string, index: number): string {
  return `${parentOrderNumber}-V${String(index).padStart(2, '0')}`;
}

export function slugify(input: string): string {
  const base = input
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  const safe = base.length >= 2 ? base : `vendor-${randomCode(6).toLowerCase()}`;
  return `${safe}-${randomCode(4).toLowerCase()}`.slice(0, 63);
}