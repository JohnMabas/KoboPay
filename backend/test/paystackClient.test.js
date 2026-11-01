'use strict';

require('./helpers/testEnv');
const test = require('node:test');
const assert = require('node:assert/strict');

const { createPaystackClient } = require('../src/services/paystackClient');

function jsonResponse(payload, ok = true) {
  return {
    ok,
    async json() {
      return payload;
    },
  };
}

test('Paystack client sends integer kobo and the server-only secret header', async () => {
  let captured;
  const client = createPaystackClient({
    secretKey: 'sk_test_abc',
    baseUrl: 'https://api.paystack.test',
    timeoutMs: 1000,
    fetchImpl: async (url, options) => {
      captured = { url, options };
      return jsonResponse({
        status: true,
        data: {
          authorization_url: 'https://checkout.paystack.com/x',
          access_code: 'ac',
          reference: 'ref',
        },
      });
    },
  });

  const data = await client.initializeTransaction({
    email: 'user@example.com',
    amountKobo: 100050,
    reference: 'ref',
    callbackUrl: 'http://localhost:3000/payment/callback',
    metadata: { payment_reference: 'ref' },
  });

  assert.equal(data.authorization_url, 'https://checkout.paystack.com/x');
  assert.equal(captured.url, 'https://api.paystack.test/transaction/initialize');
  assert.equal(captured.options.headers.Authorization, 'Bearer sk_test_abc');
  const sent = JSON.parse(captured.options.body);
  assert.equal(sent.amount, 100050);
  assert.equal(sent.currency, 'NGN');
});

test('Paystack client URL-encodes verification references', async () => {
  let url;
  const client = createPaystackClient({
    secretKey: 'sk_test_abc',
    baseUrl: 'https://api.paystack.test',
    timeoutMs: 1000,
    fetchImpl: async (requestUrl) => {
      url = requestUrl;
      return jsonResponse({ status: true, data: { status: 'success' } });
    },
  });

  await client.verifyTransaction('KP/a b');
  assert.equal(url, 'https://api.paystack.test/transaction/verify/KP%2Fa%20b');
});

test('Paystack client surfaces API errors without leaking the secret', async () => {
  const client = createPaystackClient({
    secretKey: 'sk_test_abc',
    baseUrl: 'https://api.paystack.test',
    timeoutMs: 1000,
    fetchImpl: async () => jsonResponse({ status: false, message: 'Invalid amount' }, false),
  });

  await assert.rejects(
    client.initializeTransaction({ email: 'a@b.com', amountKobo: 1, reference: 'r' }),
    (err) => {
      assert.equal(err.code, 'PAYSTACK_API_ERROR');
      assert.equal(err.message, 'Invalid amount');
      assert.equal(err.message.includes('sk_test_abc'), false);
      return true;
    }
  );
});

test('Paystack client rejects malformed responses', async () => {
  const client = createPaystackClient({
    secretKey: 'sk_test_abc',
    baseUrl: 'https://api.paystack.test',
    timeoutMs: 1000,
    fetchImpl: async () => ({
      ok: true,
      async json() {
        throw new Error('not json');
      },
    }),
  });

  await assert.rejects(
    client.verifyTransaction('ref'),
    (err) => err.code === 'PAYSTACK_BAD_RESPONSE'
  );
});

test('Paystack client times out using the configured timeout', async () => {
  const client = createPaystackClient({
    secretKey: 'sk_test_abc',
    baseUrl: 'https://api.paystack.test',
    timeoutMs: 10,
    fetchImpl: (url, { signal }) =>
      new Promise((resolve, reject) => {
        signal.addEventListener('abort', () => {
          const err = new Error('aborted');
          err.name = 'AbortError';
          reject(err);
        });
      }),
  });

  await assert.rejects(
    client.verifyTransaction('ref'),
    (err) => err.code === 'PAYSTACK_TIMEOUT' && err.statusCode === 504
  );
});

test('unconfigured client returns a safe 503 without calling fetch', async () => {
  let called = false;
  const client = createPaystackClient({
    secretKey: '',
    fetchImpl: async () => {
      called = true;
    },
  });

  assert.equal(client.isConfigured(), false);
  await assert.rejects(
    client.verifyTransaction('ref'),
    (err) => err.code === 'PAYSTACK_NOT_CONFIGURED' && err.statusCode === 503
  );
  assert.equal(called, false);
});
