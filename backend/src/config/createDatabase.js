// config/createDatabase.js — creates the target database if it does not exist.
// This is the only place in the project that uses raw SQL.
// Connecting to Aiven's default "defaultdb" database first, because we cannot
// connect to a database that doesn't exist yet in order to create it.
'use strict';

const { Client } = require('pg');
const config = require('./env');
const getSsl = require('./sslOptions');

/**
 * Connects to the Aiven service's built-in "defaultdb" database and creates
 * config.dbName if it is missing.  Called once at startup before Sequelize
 * connects.
 *
 * Note: CREATE DATABASE cannot be parameterized in PostgreSQL, so we build the
 * statement with the already-validated dbName (validated in env.js to match
 * /^[a-zA-Z0-9_]+$/).
 */
module.exports = async function createDatabaseIfMissing() {
  // Connect to the Aiven service's always-present "defaultdb" database.
  const client = new Client({
    host: config.dbHost,
    port: config.dbPort,
    user: config.dbUser,
    password: config.dbPassword,
    database: 'defaultdb',
    ssl: getSsl(),
  });

  await client.connect();

  try {
    // Check whether the target database already exists using a parameterized query.
    const { rowCount } = await client.query(
      'SELECT 1 FROM pg_database WHERE datname = $1',
      [config.dbName]
    );

    if (rowCount === 0) {
      // db name is safe — validated in env.js with /^[a-zA-Z0-9_]+$/.
      await client.query(`CREATE DATABASE "${config.dbName}"`);
      console.log(`Database "${config.dbName}" created`);
    } else {
      console.log(`Database "${config.dbName}" already exists`);
    }
  } catch (err) {
    // Aiven free plans restrict CREATE DATABASE rights.  Guide the user to the
    // console instead of leaving a cryptic permission error.
    if (err.code === '42501') {
      console.error(
        `[KoboPay] Permission denied creating database "${config.dbName}".\n` +
        'Create the database in the Aiven console (Databases tab), or set DB_NAME=defaultdb.'
      );
      throw err;
    }
    throw err;
  } finally {
    // Always close the admin connection, even if an error was thrown.
    await client.end();
  }
};
