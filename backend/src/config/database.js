// config/database.js — creates and exports the single Sequelize instance.
// Uses individual DB_* variables from config/env.js (never reads process.env).
// SSL is handled by sslOptions.js — required for Aiven connections.
'use strict';

const fs = require('fs');
const path = require('path');
const { Sequelize } = require('sequelize');
const config = require('./env');
const getSsl = require('./sslOptions');

const sequelize = new Sequelize(config.dbName, config.dbUser, config.dbPassword, {
  host: config.dbHost,
  port: config.dbPort,
  dialect: 'postgres',
  // Keep the console clean; set to console.log to see generated SQL while debugging.
  logging: false,
  // Only attach SSL dialectOptions when SSL is enabled (DB_SSL=true).
  dialectOptions: config.dbSsl ? { ssl: getSsl() } : {},
  // Conservative pool settings — Aiven free plans have a low connection limit.
  pool: { max: 5, min: 0, idle: 10000, acquire: 30000 },
});

module.exports = sequelize;
