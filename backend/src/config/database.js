// database.js — creates and exports a single Sequelize instance.
// Uses the DATABASE_URL from config/env.js (never reads process.env directly).
'use strict';

const { Sequelize } = require('sequelize');
const config = require('./env');

const sequelize = new Sequelize(config.databaseUrl, {
  dialect: 'postgres',
  // Disable SQL query logging in the console for cleaner output.
  // Set to console.log while debugging if needed.
  logging: false,
});

module.exports = sequelize;
