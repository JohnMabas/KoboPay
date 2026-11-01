// server.js — application entry point.
// env.js MUST be the very first require so process.env is loaded and validated
// before any other module reads config values.
'use strict';

const config = require('./config/env');

const createDatabaseIfMissing = require('./config/createDatabase');
const { sequelize } = require('./models');
const { runUp } = require('./config/migrator');
const createApp = require('./app');

const app = createApp();

// ── Startup ───────────────────────────────────────────────────────────────────

async function start() {
  try {
    // Step 1: Create the target database on Aiven if it doesn't exist yet.
    await createDatabaseIfMissing();

    // Step 2: Verify the target database is reachable with the configured credentials.
    await sequelize.authenticate();
    console.log('Connected to database');

    // Step 3: Create tables from Sequelize models if they don't exist yet.
    await sequelize.sync();

    // Step 4: Apply additive migrations. This adds the paymentId ledger link
    // to existing databases; sync() alone cannot alter existing tables.
    await runUp((message) => console.log(message));

    // Step 5: Start the HTTP server.
    app.listen(config.port, () => {
      console.log(`KoboPay API running on port ${config.port}`);
    });
  } catch (err) {
  console.error('\n[KoboPay] Failed to start. Check the following:');
  console.error('  • DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME in backend/.env');
  console.error('  • DB_SSL=true and DB_SSL_CA_PATH pointing to backend/certs/ca.pem');
  console.error('  • The Aiven service is running (free services can be powered off)');
  console.error('\nError detail:', err.message || '(empty message)');
  console.error('Name:', err.name, '| Code:', err.code);
  if (err.original) console.error('Original:', err.original.code, err.original.message);
  if (err.errors) err.errors.forEach((e) => console.error(' -', e.code, e.address, e.port, e.message));
  console.error(err);
  process.exit(1);
}
}

start();
