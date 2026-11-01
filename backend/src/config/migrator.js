// config/migrator.js — reusable migration runner used by scripts/migrate.js
// and by server startup so an existing database receives additive schema
// changes before payment routes become reachable.
'use strict';

const fs = require('fs');
const path = require('path');
const sequelize = require('./database');

const MIGRATIONS_DIR = path.join(__dirname, '..', '..', 'migrations');
const META_TABLE = 'SequelizeMeta';

function migrationFiles() {
  if (!fs.existsSync(MIGRATIONS_DIR)) return [];
  return fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((name) => name.endsWith('.js'))
    .sort();
}

async function ensureMetaTable() {
  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS "${META_TABLE}" (
      name VARCHAR(255) PRIMARY KEY,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
}

async function appliedNames() {
  const [rows] = await sequelize.query(`SELECT name FROM "${META_TABLE}" ORDER BY name;`);
  return rows.map((row) => row.name);
}

async function runUp(log = () => {}) {
  await ensureMetaTable();
  const applied = new Set(await appliedNames());
  const queryInterface = sequelize.getQueryInterface();

  for (const file of migrationFiles()) {
    if (applied.has(file)) continue;
    // eslint-disable-next-line global-require, import/no-dynamic-require
    const migration = require(path.join(MIGRATIONS_DIR, file));

    await sequelize.transaction(async (transaction) => {
      await migration.up(queryInterface, transaction);
      await sequelize.query(
        `INSERT INTO "${META_TABLE}" (name) VALUES ($1);`,
        { bind: [file], transaction }
      );
    });

    log(`Applied migration ${file}`);
  }

  log('Migrations up to date.');
}

async function runDown(log = () => {}) {
  await ensureMetaTable();
  const applied = await appliedNames();
  const file = applied[applied.length - 1];

  if (!file) {
    log('Nothing to roll back.');
    return;
  }

  // eslint-disable-next-line global-require, import/no-dynamic-require
  const migration = require(path.join(MIGRATIONS_DIR, file));
  const queryInterface = sequelize.getQueryInterface();

  await sequelize.transaction(async (transaction) => {
    await migration.down(queryInterface, transaction);
    await sequelize.query(`DELETE FROM "${META_TABLE}" WHERE name = $1;`, {
      bind: [file],
      transaction,
    });
  });

  log(`Rolled back ${file}`);
}

async function runStatus(log = () => {}) {
  await ensureMetaTable();
  const applied = new Set(await appliedNames());
  for (const file of migrationFiles()) {
    log(`${applied.has(file) ? '[applied]' : '[pending]'} ${file}`);
  }
}

module.exports = { runUp, runDown, runStatus, migrationFiles };
