// utils/amount.js — strict naira-to-kobo conversion using integer arithmetic.
'use strict';

const MAX_SAFE = BigInt(Number.MAX_SAFE_INTEGER);

/**
 * Convert a naira amount (string or number, max 2 decimal places) to integer
 * kobo without floating-point arithmetic. Returns null for invalid input.
 */
function nairaToKobo(value) {
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || value <= 0) return null;
    value = String(value);
    // Reject exponent notation (e.g. 1e+21); use a plain decimal string.
    if (value.includes('e') || value.includes('E')) return null;
  }

  if (typeof value !== 'string') return null;

  const trimmed = value.trim();
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(trimmed);
  if (!match) return null;

  const whole = BigInt(match[1]);
  const fraction = (match[2] || '').padEnd(2, '0');
  const kobo = whole * 100n + BigInt(fraction);

  if (kobo === 0n || kobo > MAX_SAFE) return null;
  return Number(kobo);
}

/**
 * Convert a DECIMAL string (e.g. "1500.00") to integer cents/kobo.
 * Returns null if the value cannot be represented exactly in 2dp.
 */
function decimalToCents(value) {
  const match = /^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec(String(value).trim());
  if (!match) return null;
  const sign = match[1] === '-' ? -1 : 1;
  const cents = Number(match[2]) * 100 + Number((match[3] || '').padEnd(2, '0'));
  return sign * cents;
}

function koboToNairaString(kobo) {
  const value = typeof kobo === 'bigint' ? kobo : BigInt(kobo);
  const sign = value < 0n ? '-' : '';
  const abs = value < 0n ? -value : value;
  return `${sign}${abs / 100n}.${String(abs % 100n).padStart(2, '0')}`;
}

module.exports = { nairaToKobo, decimalToCents, koboToNairaString };
