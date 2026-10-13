import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  commissionFor,
  formatMinor,
  minorUnitsFor,
  parseDecimalToMinor,
  roundHalfUpDiv,
  taxFromInclusive,
} from '../src/domain/money.ts';
import { computePricing, type PricingLine } from '../src/domain/pricing.ts';

describe('money arithmetic', () => {
  test('currency precision follows ISO 4217', () => {
    assert.equal(minorUnitsFor('EUR'), 2);
    assert.equal(minorUnitsFor('jpy'), 0);
    assert.throws(() => minorUnitsFor('XYZ'), /unsupported currency/);
  });

  test('decimal parsing respects currency precision', () => {
    assert.equal(parseDecimalToMinor('19.95', 'EUR'), 1995n);
    assert.equal(parseDecimalToMinor('19,95', 'EUR'), 1995n);
    assert.equal(parseDecimalToMinor('1200', 'JPY'), 1200n);
    assert.throws(() => parseDecimalToMinor('19.955', 'EUR'), /more precision/);
  });

  test('formatting is stable', () => {
    assert.equal(formatMinor(1995n, 'EUR'), '19.95 EUR');
    assert.equal(formatMinor(1200n, 'JPY'), '1200 JPY');
    assert.equal(formatMinor(5n, 'EUR'), '0.05 EUR');
  });

  test('division rounds half away from zero', () => {
    assert.equal(roundHalfUpDiv(5n, 2n), 3n);
    assert.equal(roundHalfUpDiv(-5n, 2n), -3n);
    assert.equal(roundHalfUpDiv(4n, 2n), 2n);
  });

  test('tax is extracted from a tax inclusive price', () => {
    // 21% Dutch VAT on a gross of 6535 minor units
    assert.equal(taxFromInclusive(6535n, 2100), 1134n);
    assert.equal(taxFromInclusive(10000n, 2100), 1736n);
    assert.equal(taxFromInclusive(10000n, 0), 0n);
  });

  test('commission is a basis point share of the vendor base', () => {
    assert.equal(commissionFor(4385n, 2000), 877n);
    assert.equal(commissionFor(2150n, 1500), 323n);
    assert.equal(commissionFor(999n, 0), 0n);
  });
});

describe('pricing engine', () => {
  const line = (overrides: Partial<PricingLine>): PricingLine => ({
    offerId: 'offer',
    vendorOrganizationId: 'vendor',
    unitPriceMinor: 1000n,
    shippingMinor: 0n,
    freeShippingThresholdMinor: null,
    quantity: 1,
    ...overrides,
  });

  test('two vendors produce two groups and one shipping charge each', () => {
    const result = computePricing(
      [
        line({ offerId: 'a', vendorOrganizationId: 'v1', unitPriceMinor: 1995n, shippingMinor: 395n, quantity: 2 }),
        line({ offerId: 'b', vendorOrganizationId: 'v2', unitPriceMinor: 2150n, shippingMinor: 0n }),
      ],
      2100,
    );
    assert.equal(result.itemsSubtotalMinor, 6140n);
    assert.equal(result.shippingMinor, 395n);
    assert.equal(result.totalMinor, 6535n);
    assert.equal(result.taxMinor, 1134n);
    assert.equal(result.vendorGroups.length, 2);
    assert.equal(result.vendorGroups.find((g) => g.vendorOrganizationId === 'v1')?.totalMinor, 4385n);
    assert.equal(result.vendorGroups.find((g) => g.vendorOrganizationId === 'v2')?.totalMinor, 2150n);
  });

  test('one vendor shipping one parcel charges the highest line shipping once', () => {
    const result = computePricing(
      [
        line({ offerId: 'a', unitPriceMinor: 500n, shippingMinor: 600n }),
        line({ offerId: 'b', unitPriceMinor: 700n, shippingMinor: 250n }),
      ],
      0,
    );
    assert.equal(result.itemsSubtotalMinor, 1200n);
    assert.equal(result.shippingMinor, 600n);
    assert.equal(result.totalMinor, 1800n);
  });

  test('a free shipping threshold removes the vendor shipping charge', () => {
    const result = computePricing(
      [line({ unitPriceMinor: 5000n, shippingMinor: 500n, freeShippingThresholdMinor: 4000n })],
      0,
    );
    assert.equal(result.shippingMinor, 0n);
    assert.equal(result.totalMinor, 5000n);
  });

  test('an empty basket cannot be priced', () => {
    assert.throws(() => computePricing([], 2100), /empty basket/);
  });
});