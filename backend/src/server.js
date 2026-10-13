// server.js — application entry point.
// env.js MUST be the very first require so process.env is loaded and validated
// before any other module reads config values.
'use strict';

const config = require('./config/env');

const express = require('express');
const cors = require('cors');
const createDatabaseIfMissing = require('./config/createDatabase');
const { sequelize } = require('./models');

const authRoutes = require('./routes/auth');
const accountRoutes = require('./routes/account');

const app = express();

// ── Middleware ────────────────────────────────────────────────────────────────

// Only allow the configured frontend origin (not a wildcard) to call this API.
app.use(cors({ origin: config.corsOrigin }));

// Parse JSON request bodies.
app.use(express.json());

// ── Routes ────────────────────────────────────────────────────────────────────

// Health check — no auth required.
app.get('/api/health', (_req, res) => {
  res.json({ success: true, data: { app: 'KoboPay', status: 'ok' } });
});

app.use('/api/auth', authRoutes);
app.use('/api/account', accountRoutes);

// ── 404 handler ───────────────────────────────────────────────────────────────

app.use((_req, res) => {
  res.status(404).json({ success: false, message: 'Route not found.' });
});

// ── Central error handler ─────────────────────────────────────────────────────
// Express recognises a 4-argument function as an error handler.
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  // Map known Sequelize errors to proper HTTP status codes.
  if (err.name === 'SequelizeUniqueConstraintError') {
    return res.status(409).json({
      success: false,
      message: 'A record with that value already exists.',
    });
  }
  if (err.name === 'SequelizeValidationError') {
    return res.status(400).json({
      success: false,
      message: err.errors.map((e) => e.message).join('; '),
    });
  }

  // Log the full error on the server for debugging.
  console.error('[KoboPay Error]', err);

  // Only include stack traces in development to avoid leaking internals.
  const isDev = config.nodeEnv === 'development';
  return res.status(500).json({
    success: false,
    message: 'An unexpected error occurred.',
    ...(isDev && { detail: err.message, stack: err.stack }),
  });
});

// ── Startup ───────────────────────────────────────────────────────────────────

async function start() {
  try {
    // Step 1: Create the target database on Aiven if it doesn't exist yet.
    // This connects to Aiven's "defaultdb" and runs CREATE DATABASE if needed.
    await createDatabaseIfMissing();

    // Step 2: Verify the target database is reachable with the configured credentials.
    await sequelize.authenticate();
    console.log('Connected to database');

    // Step 3: Create tables from Sequelize models if they don't exist yet.
    // IMPORTANT: never use force:true (drops tables) or alter:true (may corrupt data).
    // Use Sequelize migrations in production for safe schema changes.
    await sequelize.sync();

    // Step 4: Start the HTTP server.
    app.listen(config.port, () => {
      console.log(`KoboPay API running on port ${config.port}`);
    });
  } catch (err) {
    // Print a friendly hint so the developer knows where to look.
    console.error('\n[KoboPay] Failed to start. Check the following:');
    console.error('  • DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME in backend/.env');
    console.error('  • DB_SSL=true and DB_SSL_CA_PATH pointing to backend/certs/ca.pem');
    console.error('  • The Aiven service is running (free services can be powered off)');
    console.error('\nError detail:', err.message);
    process.exit(1);
  }
}

start();
