// config/env.js — loads and validates all environment variables.
// This is the ONLY file that reads process.env.
// Must be required FIRST in server.js before any other import.
'use strict';

require('dotenv').config();

// ── Required variables ────────────────────────────────────────────────────────
// These have no safe defaults; the app cannot start without them.
const REQUIRED = ['DB_HOST', 'DB_PORT', 'DB_USER', 'DB_PASSWORD', 'DB_NAME', 'JWT_SECRET'];

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

// ── Build and freeze the config object ───────────────────────────────────────
// All other backend files import from here. No other file reads process.env.
const config = Object.freeze({
  port: parseInt(process.env.PORT, 10) || 5000,
  nodeEnv: process.env.NODE_ENV || 'development',

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
});

module.exports = config;
