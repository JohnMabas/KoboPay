'use strict';

require('./helpers/testEnv');
const test = require('node:test');
const assert = require('node:assert/strict');

const { createPaymentService } = require('../src/services/paymentService');
const { AppError } = require('../src/utils/errors');
const { createMemoryModels, seedUser } = require('./helpers/memoryModels');

const CONFIG = {
  paymentMinNgn: 100,
  paymentMaxNgn: 1000000,
  paystackCallbackUrl: 'http://localhost:3000/payment/callback',
  paystackWebhookSecret: 'sk_test_kobopay',
};

function successData(reference, amountKobo, overrides = {}) {
  return {
    status: 'success',
    reference,
    amount: amountKobo,
    currency: 'NGN',
    id: 987654,
    channel: 'card',
    paid_at: new Date().toISOString(),
    metadata: { payment_reference: reference },
    ...overrides,
  };
}

function setup({
  verifyResult,
  initializeResult,
  initializeError,
  verifyError,
} = {}) {
  const models = createMemoryModels();
  const calls = { initialize: [], verify: [] };

  const paystack = {
    isConfigured: () => true,
    async initializeTransaction(args) {
      calls.initialize.push(args);
      if (initializeError) throw initializeError;
      if (typeof initializeResult === 'function') return initializeResult(args);
      return (
        initializeResult || {
          authorization_url: 'https://checkout.paystack.com/test',
          access_code: 'access_test',
          reference: args.reference,
        }
      );
    },
    async verifyTransaction(reference) {
      calls.verify.push(reference);
      if (verifyError) throw verifyError;
      if (typeof verifyResult === 'function') return verifyResult(reference);
      return verifyResult || successData(reference, 100000);
    },
  };

  const service = createPaymentService({
    Payment: models.Payment,
    User: models.User,
    Transaction: models.Transaction,
    sequelize: models.sequelize,
    paystack,
    config: CONFIG,
  });

  return { models, service, paystack, calls };
}

async function seedPayment(models, overrides = {}) {
  return models.Payment.create({
    userId: 1,
    reference: 'KP_TEST_REF',
    providerReference: 'KP_TEST_REF',
    amountKobo: 100000,
    currency: 'NGN',
    status: 'pending',
    metadata: { payment_reference: 'KP_TEST_REF' },
    ...overrides,
  });
}

test('initialize creates a pending payment and returns only checkout data', async () => {
  const { models, service, calls } = setup();
  seedUser(models.db, { id: 1 });

  const result = await service.initializeDeposit({
    userId: 1,
    amount: '1000.50',
    idempotencyKey: 'idem-1',
  });

  assert.equal(result.status, 'pending');
  assert.equal(result.amount, '1000.50');
  assert.equal(result.amount_kobo, 100050);
  assert.equal(result.currency, 'NGN');
  assert.equal(result.authorization_url, 'https://checkout.paystack.com/test');
  assert.equal(result.access_code, 'access_test');
  assert.equal(calls.initialize.length, 1);
  assert.equal(calls.initialize[0].amountKobo, 100050);
  assert.equal(calls.initialize[0].email, 'user@example.com');
  assert.equal(models.db.state.payments.length, 1);
  assert.equal(models.db.state.payments[0].status, 'pending');
  assert.equal(models.db.state.payments[0].providerReference, result.reference);
});

test('initialize replays an existing idempotency key without contacting Paystack again', async () => {
  const { models, service, calls } = setup();
  seedUser(models.db, { id: 1 });

  const first = await service.initializeDeposit({
    userId: 1,
    amount: '500',
    idempotencyKey: 'idem-replay',
  });
  const second = await service.initializeDeposit({
    userId: 1,
    amount: '500',
    idempotencyKey: 'idem-replay',
  });

  assert.equal(first.reference, second.reference);
  assert.equal(calls.initialize.length, 1);
  assert.equal(models.db.state.payments.length, 1);
});

test('initialize rejects invalid and out-of-range amounts', async () => {
  const { models, service } = setup();
  seedUser(models.db, { id: 1 });

  for (const amount of ['99.99', '0', '-10', '100.001', 'abc', '1000001']) {
    await assert.rejects(
      service.initializeDeposit({ userId: 1, amount }),
      (err) => err instanceof AppError && err.statusCode === 400
    );
  }
  assert.equal(models.db.state.payments.length, 0);
});

test('initialize marks the payment failed when Paystack initialization fails', async () => {
  const paystackError = new AppError('Paystack timed out.', 504, 'PAYSTACK_TIMEOUT');
  const { models, service } = setup({ initializeError: paystackError });
  seedUser(models.db, { id: 1 });

  await assert.rejects(
    service.initializeDeposit({ userId: 1, amount: '1000' }),
    (err) => err.code === 'PAYSTACK_TIMEOUT'
  );

  assert.equal(models.db.state.payments.length, 1);
  assert.equal(models.db.state.payments[0].status, 'failed');
});

test('verify credits the wallet exactly once for a successful transaction', async () => {
  const { models, service } = setup({
    verifyResult: (ref) => successData(ref, 100000),
  });
  seedUser(models.db, { id: 1, balance: '500.00' });
  await seedPayment(models);

  const first = await service.verifyDeposit({ userId: 1, reference: 'KP_TEST_REF' });
  const second = await service.verifyDeposit({ userId: 1, reference: 'KP_TEST_REF' });

  assert.equal(first.status, 'success');
  assert.equal(first.credited, true);
  assert.equal(first.balance, '1500.00');
  assert.equal(second.already_processed, true);
  assert.equal(second.credited, false);
  assert.equal(models.db.state.transactions.length, 1);
  assert.equal(models.db.state.transactions[0].amount, '1000.00');
  assert.equal(models.db.state.transactions[0].paymentId, models.db.state.payments[0].id);
  assert.equal(models.db.state.users[0].balance, '1500.00');
});

test('verify does not credit pending, failed, or abandoned payments', async () => {
  for (const status of ['pending', 'failed', 'abandoned']) {
    const { models, service } = setup({
      verifyResult: (ref) => successData(ref, 100000, { status }),
    });
    seedUser(models.db, { id: 1, balance: '0.00' });
    await seedPayment(models);

    const result = await service.verifyDeposit({ userId: 1, reference: 'KP_TEST_REF' });

    assert.equal(result.credited, false);
    assert.equal(models.db.state.transactions.length, 0);
    assert.equal(models.db.state.users[0].balance, '0.00');
    if (status !== 'pending') assert.equal(result.status, status);
  }
});

test('verify rejects amount and currency mismatches without crediting', async () => {
  const cases = [
    successData('KP_TEST_REF', 99999),
    successData('KP_TEST_REF', 100000, { currency: 'USD' }),
    successData('DIFFERENT_REF', 100000),
  ];

  for (const data of cases) {
    const { models, service } = setup({ verifyResult: data });
    seedUser(models.db, { id: 1, balance: '0.00' });
    await seedPayment(models);

    await assert.rejects(
      service.verifyDeposit({ userId: 1, reference: 'KP_TEST_REF' }),
      (err) => err instanceof AppError && err.statusCode === 409
    );

    assert.equal(models.db.state.transactions.length, 0);
    assert.equal(models.db.state.users[0].balance, '0.00');
    assert.equal(models.db.state.payments[0].status, 'pending');
  }
});

test('verify rejects unknown references and another user\'s payment', async () => {
  const { models, service } = setup();
  seedUser(models.db, { id: 1 });
  seedUser(models.db, { id: 2, email: 'other@example.com' });
  await seedPayment(models, { userId: 1 });

  await assert.rejects(
    service.verifyDeposit({ userId: 1, reference: 'UNKNOWN' }),
    (err) => err.statusCode === 404
  );
  await assert.rejects(
    service.verifyDeposit({ userId: 2, reference: 'KP_TEST_REF' }),
    (err) => err.statusCode === 404
  );
});

test('webhook charge.success verifies with Paystack and credits once across repeats', async () => {
  const { models, service, calls } = setup({
    verifyResult: (ref) => successData(ref, 100000),
  });
  seedUser(models.db, { id: 1, balance: '0.00' });
  await seedPayment(models);

  const event = {
    event: 'charge.success',
    data: { reference: 'KP_TEST_REF', status: 'success', amount: 100000, currency: 'NGN' },
  };

  const first = await service.handleWebhookEvent(event);
  const second = await service.handleWebhookEvent(event);

  assert.equal(first.credited, true);
  assert.equal(second.alreadyProcessed, true);
  assert.equal(calls.verify.length, 1); // no second Paystack call once already successful
  assert.equal(models.db.state.transactions.length, 1);
  assert.equal(models.db.state.users[0].balance, '1000.00');
});

test('webhook ignores unsupported events and unknown references', async () => {
  const { models, service, calls } = setup();
  seedUser(models.db, { id: 1 });

  const unsupported = await service.handleWebhookEvent({
    event: 'transfer.success',
    data: { reference: 'anything' },
  });
  const unknown = await service.handleWebhookEvent({
    event: 'charge.success',
    data: { reference: 'does-not-exist' },
  });

  assert.equal(unsupported.ignored, true);
  assert.equal(unknown.ignored, true);
  assert.equal(calls.verify.length, 0);
});

test('concurrent verification and webhook delivery credit only once', async () => {
  const { models, service } = setup({
    verifyResult: (ref) => successData(ref, 100000),
  });
  seedUser(models.db, { id: 1, balance: '0.00' });
  await seedPayment(models);

  const results = await Promise.all([
    service.verifyDeposit({ userId: 1, reference: 'KP_TEST_REF' }),
    service.handleWebhookEvent({
      event: 'charge.success',
      data: { reference: 'KP_TEST_REF' },
    }),
    service.handleWebhookEvent({
      event: 'charge.success',
      data: { reference: 'KP_TEST_REF' },
    }),
  ]);

  assert.equal(models.db.state.transactions.length, 1);
  assert.equal(models.db.state.users[0].balance, '1000.00');
  assert.equal(models.db.state.payments[0].status, 'success');
  assert.equal(results.filter((r) => r.credited === true).length, 1);
});

test('Paystack verification failures leave the payment pending and uncredited', async () => {
  const paystackError = new AppError('Paystack unavailable.', 502, 'PAYSTACK_UNAVAILABLE');
  const { models, service } = setup({ verifyError: paystackError });
  seedUser(models.db, { id: 1, balance: '0.00' });
  await seedPayment(models);

  await assert.rejects(
    service.verifyDeposit({ userId: 1, reference: 'KP_TEST_REF' }),
    (err) => err.code === 'PAYSTACK_UNAVAILABLE'
  );

  assert.equal(models.db.state.payments[0].status, 'pending');
  assert.equal(models.db.state.transactions.length, 0);
  assert.equal(models.db.state.users[0].balance, '0.00');
});

test('wallet update failure rolls back the payment, ledger, and balance changes', async () => {
  const { models, service } = setup({
    verifyResult: (ref) => successData(ref, 100000),
  });
  seedUser(models.db, { id: 1, balance: '500.00' });
  await seedPayment(models);

  models.db.state.users[0].__failUpdate = true;

  await assert.rejects(
    service.verifyDeposit({ userId: 1, reference: 'KP_TEST_REF' }),
    /simulated database write failure/
  );

  assert.equal(models.db.state.payments[0].status, 'pending');
  assert.equal(models.db.state.transactions.length, 0);
  assert.equal(models.db.state.users[0].balance, '500.00');
});
