'use strict';

const fs = require('fs');
const path = require('path');
const config = require('./env');

module.exports = function getSsl() {
  if (!config.dbSsl) {
    if (config.nodeEnv === 'production') {
      throw new Error('DB_SSL must be true in production.');
    }

    return false;
  }

  if (!config.dbSslCaPath) {
    throw new Error(
      'DB_SSL_CA_PATH is required when DB_SSL=true. ' +
      'Provide the Aiven CA certificate path.'
    );
  }

  const caPath = path.isAbsolute(config.dbSslCaPath)
    ? config.dbSslCaPath
    : path.resolve(process.cwd(), config.dbSslCaPath);

  if (!fs.existsSync(caPath)) {
    throw new Error(`Aiven CA certificate not found at: ${caPath}`);
  }

  return {
    require: true,
    rejectUnauthorized: true,
    ca: fs.readFileSync(caPath, 'utf8'),
  };
};