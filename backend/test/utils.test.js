'use strict';

require('./helpers/testEnv');
const test = require('node:test');
const assert = require('node:assert/strict');

const {
  isValidPaystackSignature,
  createPaystackSignature,
} = require('../src/utils/paystackSignature');
const {
  nairaToKobo,
  decimalToCents,
  koboToNairaString,
} = require('../src/utils/amount');

test('nairaToKobo uses strict integer arithmetic', () => {
  assert.equal(nairaToKobo('1000'), 100000);
  assert.equal(nairaToKobo('1000.5'), 100050);
  assert.equal(nairaToKobo('0.29'), 29);
  assert.equal(nairaToKobo(2500.75), 250075);
  assert.equal(nairaToKobo('100.001'), null);
  assert.equal(nairaToKobo('1e3'), null);
  assert.equal(nairaToKobo('-5'), null);
  assert.equal(nairaToKobo('abc'), null);
  assert.equal(nairaToKobo('0'), null);
});

test('kobo/decimal conversions round-trip without floats', () => {
  assert.equal(koboToNairaString(100050), '1000.50');
  assert.equal(decimalToCents('1500.00'), 150000);
  assert.equal(decimalToCents('0.05'), 5);
  assert.equal(decimalToCents('not-money'), null);
});

test('Paystack signature verification accepts only the exact raw body', () => {
  const secret = 'sk_test_secret';
  const raw = Buffer.from(JSON.stringify({ event: 'charge.success', data: { reference: 'x' } }));
  const signature = createPaystackSignature(raw, secret);

  assert.equal(isValidPaystackSignature(raw, signature, secret), true);
  assert.equal(isValidPaystackSignature(raw, signature, 'wrong-secret'), false);
  assert.equal(isValidPaystackSignature(Buffer.from('{}'), signature, secret), false);
  assert.equal(isValidPaystackSignature(raw, 'not-a-hex-signature', secret), false);
  assert.equal(isValidPaystackSignature(raw, signature.toUpperCase(), secret), true);
});
