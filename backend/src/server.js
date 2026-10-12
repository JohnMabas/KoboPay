// server.js — application entry point.
// env.js MUST be the first require so process.env is loaded before any other
// module reads config values.
'use strict';

const config = require('./config/env');

const express = require('express');
const cors = require('cors');
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

// ── Start ─────────────────────────────────────────────────────────────────────

async function start() {
  try {
    // Verify the database is reachable.
    await sequelize.authenticate();
    console.log('Database connected successfully');

    // Create tables from models if they don't exist yet.
    // NOTE: sync() will NOT modify or drop existing columns.
    // Use Sequelize migrations in production for schema changes.
    await sequelize.sync();
    console.log('Database synced');

    app.listen(config.port, () => {
      console.log(`KoboPay API running on port ${config.port}`);
    });
  } catch (err) {
    console.error('[KoboPay] Failed to start:', err.message);
    process.exit(1);
  }
}

start();
