// env.js — loads and validates all environment variables.
// This is the ONLY file that reads process.env.
// Must be required FIRST in server.js before any other import.
'use strict';

require('dotenv').config();

// Validate that required secrets are present before starting.
const missing = [];
if (!process.env.DATABASE_URL) missing.push('DATABASE_URL');
if (!process.env.JWT_SECRET) missing.push('JWT_SECRET');

if (missing.length > 0) {
  console.error(
    `[KoboPay] Missing required environment variable(s): ${missing.join(', ')}\n` +
    'Copy backend/.env.example to backend/.env and fill in the values.'
  );
  process.exit(1);
}

const config = Object.freeze({
  port: parseInt(process.env.PORT, 10) || 5000,
  nodeEnv: process.env.NODE_ENV || 'development',

  // Database — never logged, never given a default
  databaseUrl: process.env.DATABASE_URL,

  // Auth
  jwtSecret: process.env.JWT_SECRET,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '1d',
  saltRounds: parseInt(process.env.BCRYPT_SALT_ROUNDS, 10) || 10,

  // CORS
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:3000',
});

module.exports = config;
