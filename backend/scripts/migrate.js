// scripts/migrate.js — CLI wrapper around src/config/migrator.js.
// Usage:
//   npm run migrate          # apply all pending migrations
//   npm run migrate:undo     # roll back the most recent migration
//   npm run migrate:status   # list applied/pending migrations
'use strict';

const sequelize = require('../src/config/database');
const { runUp, runDown, runStatus } = require('../src/config/migrator');

async function main() {
  const command = process.argv[2] || 'up';
  try {
    await sequelize.authenticate();
    if (command === 'up') await runUp(console.log);
    else if (command === 'down' || command === 'undo') await runDown(console.log);
    else if (command === 'status') await runStatus(console.log);
    else {
      console.error(`Unknown migration command: ${command}`);
      process.exitCode = 1;
    }
  } catch (err) {
    console.error('Migration failed:', err.message);
    process.exitCode = 1;
  } finally {
    await sequelize.close();
  }
}

main();
