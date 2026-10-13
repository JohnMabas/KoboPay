// config/sslOptions.js — builds the SSL configuration object for PostgreSQL.
// Aiven requires SSL; passing a CA certificate verifies the server's identity.
'use strict';

const fs = require('fs');
const path = require('path');
const config = require('./env');

/**
 * Returns the SSL settings to pass to pg / Sequelize dialectOptions.
 * - Returns false when DB_SSL is not enabled.
 * - Returns { rejectUnauthorized: true, ca: '...' } when a CA path is provided.
 * - Falls back to { rejectUnauthorized: false } (dev-only) when DB_SSL=true
 *   but no CA path is set, and prints a warning.
 */
module.exports = function getSsl() {
  if (!config.dbSsl) return false;

  if (config.dbSslCaPath) {
    // Read the Aiven CA certificate so pg can verify the server's TLS cert.
    return {
      rejectUnauthorized: true,
      ca: fs.readFileSync(path.resolve(config.dbSslCaPath)).toString(),
    };
  }

  // No CA path provided — skip server certificate verification.
  // Only acceptable in local development; never do this in production.
  console.warn(
    'WARNING: DB_SSL_CA_PATH not set, certificate is not verified (dev only).'
  );
  return { rejectUnauthorized: false };
};
