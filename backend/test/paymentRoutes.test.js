'use strict';

require('./helpers/testEnv');
const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');

const createApp = require('../src/app');
const config = require('../src/config/env');
const { AppError } = require('../src/utils/errors');
const { createPaystackSignature } = require('../src/utils/paystackSignature');

function makeFakeService() {
  const calls = { initialize: [], verify: [], webhook: [] };

  return {
    calls,
    async initializeDeposit(args) {
      calls.initialize.push(args);
      if (args.amount === 'bad') {
        throw new AppError('amount is invalid.', 400, 'INVALID_AMOUNT');
      }
      return {
        reference: 'KP_ROUTE_REF',
        paystack_reference: 'KP_ROUTE_REF',
        authorization_url: 'https://checkout.paystack.com/route-test',
        access_code: 'access_route',
        amount: '1000.00',
        amount_kobo: 100000,
        currency: 'NGN',
        status: 'pending',
        credited: false,
        already_processed: false,
      };
    },
    async verifyDeposit({ userId, reference }) {
      calls.verify.push({ userId, reference });
      if (reference === 'missing') {
        throw new AppError('Payment not found.', 404, 'PAYMENT_NOT_FOUND');
      }
      return {
        reference,
        amount: '1000.00',
        amount_kobo: 100000,
        currency: 'NGN',
        status: 'success',
        credited: true,
        already_processed: false,
        balance: '1000.00',
      };
    },
    async handleWebhookEvent(event) {
      calls.webhook.push(event);
      return { credited: true, ignored: false };
    },
  };
}

function startServer(service) {
  const app = createApp({ paymentService: service });
  return new Promise((resolve) => {
    const server = app.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({ server, base: `http://127.0.0.1:${port}` });
    });
  });
}

function authToken() {
  return jwt.sign({ id: 42 }, config.jwtSecret, { expiresIn: '1h' });
}

test('payment routes', async (t) => {
  const service = makeFakeService();
  const { server, base } = await startServer(service);
  const token = authToken();

  t.after(() => new Promise((resolve) => server.close(resolve)));

  await t.test('reject unauthenticated initialization', async () => {
    const res = await fetch(`${base}/api/payments/paystack/initialize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount: '1000' }),
    });
    assert.equal(res.status, 401);
  });

  await t.test('initialize uses the authenticated user, not a client-supplied id', async () => {
    const res = await fetch(`${base}/api/payments/paystack/initialize`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        'Idempotency-Key': 'idem-route',
      },
      body: JSON.stringify({ amount: '1000', userId: 999 }),
    });
    const body = await res.json();

    assert.equal(res.status, 201);
    assert.equal(body.success, true);
    assert.equal(body.data.authorization_url, 'https://checkout.paystack.com/route-test');
    assert.equal(service.calls.initialize.length, 1);
    assert.equal(service.calls.initialize[0].userId, 42);
    assert.equal(service.calls.initialize[0].idempotencyKey, 'idem-route');
  });

  await t.test('surface service validation errors', async () => {
    const res = await fetch(`${base}/api/payments/paystack/initialize`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ amount: 'bad' }),
    });
    assert.equal(res.status, 400);
  });

  await t.test('reject unauthenticated verification', async () => {
    const res = await fetch(`${base}/api/payments/paystack/verify/KP_ROUTE_REF`);
    assert.equal(res.status, 401);
  });

  await t.test('verify passes the authenticated user id and reference to the service', async () => {
    const res = await fetch(`${base}/api/payments/paystack/verify/KP_ROUTE_REF`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const body = await res.json();

    assert.equal(res.status, 200);
    assert.equal(body.data.status, 'success');
    assert.deepEqual(service.calls.verify[0], { userId: 42, reference: 'KP_ROUTE_REF' });
  });

  await t.test('return 404 for an unknown payment reference', async () => {
    const res = await fetch(`${base}/api/payments/paystack/verify/missing`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(res.status, 404);
  });

  await t.test('reject a webhook with an invalid signature', async () => {
    const raw = JSON.stringify({ event: 'charge.success', data: { reference: 'KP_ROUTE_REF' } });
    const res = await fetch(`${base}/api/payments/paystack/webhook`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-paystack-signature': '0'.repeat(128),
      },
      body: raw,
    });

    assert.equal(res.status, 401);
    assert.equal(service.calls.webhook.length, 0);
  });

  await t.test('process a valid charge.success webhook', async () => {
    const event = {
      event: 'charge.success',
      data: { reference: 'KP_ROUTE_REF', status: 'success', amount: 100000, currency: 'NGN' },
    };
    const raw = JSON.stringify(event);
    const signature = createPaystackSignature(
      Buffer.from(raw),
      config.paystackWebhookSecret
    );

    const res = await fetch(`${base}/api/payments/paystack/webhook`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-paystack-signature': signature,
      },
      body: raw,
    });

    assert.equal(res.status, 200);
    assert.equal(service.calls.webhook.length, 1);
    assert.deepEqual(service.calls.webhook[0], event);
  });

  await t.test('acknowledge repeated webhook deliveries', async () => {
    const event = { event: 'charge.success', data: { reference: 'KP_ROUTE_REF' } };
    const raw = JSON.stringify(event);
    const signature = createPaystackSignature(
      Buffer.from(raw),
      config.paystackWebhookSecret
    );

    for (let i = 0; i < 2; i += 1) {
      const res = await fetch(`${base}/api/payments/paystack/webhook`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-paystack-signature': signature,
        },
        body: raw,
      });
      assert.equal(res.status, 200);
    }

    assert.equal(service.calls.webhook.length, 3);
  });
});
