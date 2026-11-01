'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { spawnSync } = require('child_process');

const BACKEND_DIR = path.join(__dirname, '..');

test('production startup fails safely when Paystack configuration is missing', () => {
  const result = spawnSync(
    process.execPath,
    ['-e', "require('./src/config/env')"],
    {
      cwd: BACKEND_DIR,
      env: {
        ...process.env,
        NODE_ENV: 'production',
        DB_HOST: 'localhost',
        DB_PORT: '5432',
        DB_USER: 'test',
        DB_PASSWORD: 'test',
        DB_NAME: 'kobopay_test',
        DB_SSL: 'false',
        JWT_SECRET: 'test-secret',
        PAYSTACK_SECRET_KEY: '',
        PAYSTACK_CALLBACK_URL: '',
      },
      encoding: 'utf8',
    }
  );

  assert.equal(result.status, 1);
  assert.match(result.stderr, /Missing required Paystack environment variable/);
  assert.match(result.stderr, /PAYSTACK_SECRET_KEY/);
  assert.match(result.stderr, /PAYSTACK_CALLBACK_URL/);
});
