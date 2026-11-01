// config/env.js — loads and validates all environment variables.
// This is the ONLY file that reads process.env.
// Must be required FIRST in server.js before any other import.
'use strict';

require('dotenv').config();

// ── Required variables ────────────────────────────────────────────────────────
// These have no safe defaults; the app cannot start without them.
const REQUIRED = [
  'DB_HOST', 'DB_PORT', 'DB_USER', 'DB_PASSWORD', 'DB_NAME', 'JWT_SECRET',
];

const missing = REQUIRED.filter((key) => !process.env[key]);
if (missing.length > 0) {
  console.error(
    `[KoboPay] Missing required environment variable(s): ${missing.join(', ')}\n` +
    'Copy backend/.env.example to backend/.env and fill in the values.'
  );
  process.exit(1);
}

// ── DB_NAME safety check ──────────────────────────────────────────────────────
// DB_NAME is used in a CREATE DATABASE statement which cannot be parameterized,
// so we validate it strictly to prevent SQL injection.
if (!/^[a-zA-Z0-9_]+$/.test(process.env.DB_NAME)) {
  console.error(
    `[KoboPay] DB_NAME "${process.env.DB_NAME}" contains invalid characters.\n` +
    'DB_NAME must only contain letters, numbers, and underscores.'
  );
  process.exit(1);
}

// ── Paystack variables ────────────────────────────────────────────────────────
// Payments are optional in development so the rest of the API can boot without
// credentials. In production we fail closed: without a secret key, no payment
// endpoint should ever be reachable.
const PAYSTACK_REQUIRED_IN_PRODUCTION = ['PAYSTACK_SECRET_KEY', 'PAYSTACK_CALLBACK_URL'];
const nodeEnv = process.env.NODE_ENV || 'development';
const missingPaystack = PAYSTACK_REQUIRED_IN_PRODUCTION.filter((key) => !process.env[key]);

if (nodeEnv === 'production' && missingPaystack.length > 0) {
  console.error(
    `[KoboPay] Missing required Paystack environment variable(s): ${missingPaystack.join(', ')}\n` +
    'Set them in your hosting provider before starting the API.'
  );
  process.exit(1);
}

// Paystack's documented webhook signature is HMAC-SHA512 using the secret key.
// PAYSTACK_WEBHOOK_SECRET is an optional override for advanced setups where a
// separate value is configured; when absent the secret key is used.
const paystackWebhookSecret =
  process.env.PAYSTACK_WEBHOOK_SECRET || process.env.PAYSTACK_SECRET_KEY || '';

function positiveInt(value, fallback) {
  const parsed = parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

// ── Build and freeze the config object ───────────────────────────────────────
// All other backend files import from here. No other file reads process.env.
const config = Object.freeze({
  port: parseInt(process.env.PORT, 10) || 5000,
  nodeEnv,

  // Aiven / PostgreSQL connection — individual vars (no DATABASE_URL)
  dbHost: process.env.DB_HOST,
  dbPort: parseInt(process.env.DB_PORT, 10),
  dbUser: process.env.DB_USER,
  dbPassword: process.env.DB_PASSWORD,    // never logged
  dbName: process.env.DB_NAME,

  // SSL — Aiven requires SSL; set DB_SSL=true and point DB_SSL_CA_PATH to ca.pem
  dbSsl: process.env.DB_SSL === 'true',
  dbSslCaPath: process.env.DB_SSL_CA_PATH || '',

  // Auth — never logged
  jwtSecret: process.env.JWT_SECRET,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '1d',
  saltRounds: parseInt(process.env.BCRYPT_SALT_ROUNDS, 10) || 10,

  // CORS — only this origin may call the API
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:3000',

  // Paystack — secrets are never logged or sent to the frontend.
  paystackSecretKey: process.env.PAYSTACK_SECRET_KEY || '',
  paystackPublicKey: process.env.PAYSTACK_PUBLIC_KEY || '',
  paystackCallbackUrl:
    process.env.PAYSTACK_CALLBACK_URL ||
    `${process.env.CORS_ORIGIN || 'http://localhost:3000'}/payment/callback`,
  paystackWebhookSecret,
  // Overridable for tests and for Paystack-compatible sandboxes.
  paystackBaseUrl: process.env.PAYSTACK_BASE_URL || 'https://api.paystack.co',
  paystackTimeoutMs: positiveInt(process.env.PAYSTACK_TIMEOUT_MS, 15000),

  // Deposit limits, expressed in whole naira (fractions are rejected).
  paymentMinNgn: positiveInt(process.env.PAYMENT_MIN_NGN, 100),
  paymentMaxNgn: positiveInt(process.env.PAYMENT_MAX_NGN, 1000000),

  // Basic per-user payment endpoint throttling.
  paymentRateLimitWindowMs: positiveInt(process.env.PAYMENT_RATE_LIMIT_WINDOW_MS, 60000),
  paymentInitRateLimit: positiveInt(process.env.PAYMENT_INIT_RATE_LIMIT, 10),
  paymentVerifyRateLimit: positiveInt(process.env.PAYMENT_VERIFY_RATE_LIMIT, 30),
});

module.exports = config;
