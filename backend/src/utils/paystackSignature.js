// utils/paystackSignature.js — official Paystack webhook signature check.
// Paystack sends x-paystack-signature: HMAC-SHA512(rawBody, secretKey).
'use strict';

const crypto = require('crypto');

function isValidPaystackSignature(rawBody, signature, secret) {
  if (!secret || !Buffer.isBuffer(rawBody) || rawBody.length === 0) return false;
  if (typeof signature !== 'string' || !/^[a-f0-9]{128}$/i.test(signature)) return false;

  const expected = crypto.createHmac('sha512', secret).update(rawBody).digest();
  const provided = Buffer.from(signature, 'hex');

  return provided.length === expected.length && crypto.timingSafeEqual(provided, expected);
}

function createPaystackSignature(rawBody, secret) {
  return crypto.createHmac('sha512', secret).update(rawBody).digest('hex');
}

module.exports = { isValidPaystackSignature, createPaystackSignature };
