// services/paymentService.js — Paystack initialization, verification, webhook
// processing, and the exactly-once wallet credit routine.
'use strict';

const crypto = require('crypto');
const { Op } = require('sequelize');
const { AppError } = require('../utils/errors');
const { nairaToKobo, decimalToCents, koboToNairaString } = require('../utils/amount');

function createPaymentService({
  Payment,
  User,
  Transaction,
  sequelize,
  paystack,
  config,
  now = () => new Date(),
}) {
  function requireConfigured() {
    if (!paystack.isConfigured || !paystack.isConfigured()) {
      throw new AppError(
        'Paystack is not configured on the server.',
        503,
        'PAYSTACK_NOT_CONFIGURED'
      );
    }
  }

  function validateIdempotencyKey(key) {
    if (key === undefined || key === null) return null;
    if (typeof key !== 'string') {
      throw new AppError('Idempotency-Key must be a string.', 400, 'INVALID_IDEMPOTENCY_KEY');
    }
    const trimmed = key.trim();
    if (!trimmed) return null;
    if (trimmed.length > 255 || !/^[A-Za-z0-9._:-]+$/.test(trimmed)) {
      throw new AppError(
        'Idempotency-Key contains invalid characters.',
        400,
        'INVALID_IDEMPOTENCY_KEY'
      );
    }
    return trimmed;
  }

  function validateAmount(amount) {
    const amountKobo = nairaToKobo(amount);
    if (amountKobo === null) {
      throw new AppError(
        'amount must be a positive naira value with at most 2 decimal places.',
        400,
        'INVALID_AMOUNT'
      );
    }

    const minKobo = config.paymentMinNgn * 100;
    const maxKobo = config.paymentMaxNgn * 100;

    if (amountKobo < minKobo || amountKobo > maxKobo) {
      throw new AppError(
        `amount must be between ${config.paymentMinNgn} and ${config.paymentMaxNgn} NGN.`,
        400,
        'AMOUNT_OUT_OF_RANGE'
      );
    }

    return amountKobo;
  }

  function paymentView(payment, { balance, credited, alreadyProcessed } = {}) {
    const view = {
      reference: payment.reference,
      paystack_reference: payment.providerReference,
      amount: koboToNairaString(payment.amountKobo),
      amount_kobo: Number(payment.amountKobo),
      currency: payment.currency,
      status: payment.status,
      credited: Boolean(credited),
      already_processed: Boolean(alreadyProcessed),
    };

    if (payment.authorizationUrl) view.authorization_url = payment.authorizationUrl;
    if (payment.accessCode) view.access_code = payment.accessCode;
    if (balance !== undefined) view.balance = balance;

    return view;
  }

  async function balanceFor(userId, transaction) {
    const user = await User.findByPk(userId, { transaction });
    if (!user) throw new AppError('User not found.', 404, 'USER_NOT_FOUND');
    return user.balance;
  }

  async function findOwnedPayment(userId, reference) {
    if (typeof reference !== 'string' || reference.length === 0 || reference.length > 100) {
      throw new AppError('Payment not found.', 404, 'PAYMENT_NOT_FOUND');
    }

    const payment = await Payment.findOne({
      where: {
        userId,
        [Op.or]: [{ reference }, { providerReference: reference }],
      },
    });

    if (!payment) {
      // Deliberately do not reveal whether another user owns the reference.
      throw new AppError('Payment not found.', 404, 'PAYMENT_NOT_FOUND');
    }

    return payment;
  }

  async function initializeDeposit({ userId, amount, idempotencyKey }) {
    requireConfigured();

    const key = validateIdempotencyKey(idempotencyKey);
    const amountKobo = validateAmount(amount);

    const user = await User.findByPk(userId);
    if (!user) throw new AppError('User not found.', 404, 'USER_NOT_FOUND');

    // Idempotent replay: return the original attempt rather than charging or
    // initializing a second Paystack transaction.
    if (key) {
      const existing = await Payment.findOne({ where: { userId, idempotencyKey: key } });
      if (existing) {
        const balance = existing.status === 'success' ? await balanceFor(userId) : undefined;
        return paymentView(existing, { balance });
      }
    }

    const reference = `KP_${Date.now().toString(36)}_${crypto.randomBytes(12).toString('hex')}`;

    let payment;
    try {
      payment = await Payment.create({
        userId,
        reference,
        amountKobo,
        currency: 'NGN',
        provider: 'paystack',
        status: 'pending',
        idempotencyKey: key,
        metadata: {
          payment_reference: reference,
          user_id: userId,
        },
      });
    } catch (err) {
      // A concurrent request with the same idempotency key won the race.
      if (err.name === 'SequelizeUniqueConstraintError' && key) {
        const existing = await Payment.findOne({ where: { userId, idempotencyKey: key } });
        if (existing) return paymentView(existing);
      }
      throw err;
    }

    let initialized;
    try {
      initialized = await paystack.initializeTransaction({
        email: user.email,
        amountKobo,
        reference,
        callbackUrl: config.paystackCallbackUrl,
        metadata: {
          payment_reference: reference,
          user_id: userId,
        },
      });
    } catch (err) {
      await payment.update({
        status: 'failed',
        failureReason: err.code || 'PAYSTACK_INITIALIZATION_FAILED',
      });
      throw err;
    }

    const providerReference =
      initialized && typeof initialized.reference === 'string' ? initialized.reference : null;
    const authorizationUrl =
      initialized && typeof initialized.authorization_url === 'string'
        ? initialized.authorization_url
        : null;
    const accessCode =
      initialized && typeof initialized.access_code === 'string' ? initialized.access_code : null;

    if (!providerReference || !authorizationUrl) {
      await payment.update({
        status: 'failed',
        failureReason: 'PAYSTACK_BAD_INITIALIZATION_RESPONSE',
      });
      throw new AppError(
        'Paystack returned an invalid initialization response.',
        502,
        'PAYSTACK_BAD_RESPONSE'
      );
    }

    if (providerReference !== reference) {
      await payment.update({
        status: 'failed',
        failureReason: 'PAYSTACK_REFERENCE_MISMATCH',
      });
      throw new AppError(
        'Paystack returned an unexpected transaction reference.',
        502,
        'PAYSTACK_REFERENCE_MISMATCH'
      );
    }

    await payment.update({
      providerReference,
      authorizationUrl,
      accessCode,
    });

    return paymentView(payment);
  }

  function validateVerifiedTransaction(payment, data) {
    if (!data || data.status !== 'success') {
      throw new AppError(
        'Payment is not successful yet.',
        409,
        'PAYMENT_NOT_SUCCESSFUL'
      );
    }

    const expectedReference = payment.providerReference || payment.reference;
    if (typeof data.reference !== 'string' || data.reference !== expectedReference) {
      throw new AppError(
        'Paystack reference does not match this payment.',
        409,
        'PAYMENT_REFERENCE_MISMATCH'
      );
    }

    const expectedAmount = Number(payment.amountKobo);
    const paidAmount = Number(data.amount);
    if (!Number.isSafeInteger(paidAmount) || paidAmount !== expectedAmount) {
      throw new AppError(
        'Paystack amount does not match this payment.',
        409,
        'PAYMENT_AMOUNT_MISMATCH'
      );
    }

    if (typeof data.currency !== 'string' || data.currency.toUpperCase() !== payment.currency) {
      throw new AppError(
        'Paystack currency does not match this payment.',
        409,
        'PAYMENT_CURRENCY_MISMATCH'
      );
    }

    const metadata = data.metadata;
    if (metadata && typeof metadata === 'object' && metadata.payment_reference) {
      if (metadata.payment_reference !== payment.reference) {
        throw new AppError(
          'Paystack metadata does not match this payment.',
          409,
          'PAYMENT_METADATA_MISMATCH'
        );
      }
    }
  }

  async function creditVerifiedPayment(paymentId, data, { source }) {
    return sequelize.transaction(async (t) => {
      // Row lock serializes verification and webhook delivery for this payment.
      const payment = await Payment.findByPk(paymentId, {
        transaction: t,
        lock: t.LOCK.UPDATE,
      });

      if (!payment) throw new AppError('Payment not found.', 404, 'PAYMENT_NOT_FOUND');

      if (payment.status === 'success') {
        const balance = await balanceFor(payment.userId, t);
        return {
          payment,
          credited: false,
          alreadyProcessed: true,
          balance,
        };
      }

      // Re-validate against the locked row so a concurrent status change or a
      // tampered payload can never credit a different amount/user.
      validateVerifiedTransaction(payment, data);

      const user = await User.findByPk(payment.userId, {
        transaction: t,
        lock: t.LOCK.UPDATE,
      });
      if (!user) throw new AppError('User not found.', 404, 'USER_NOT_FOUND');

      const currentCents = decimalToCents(user.balance);
      const creditCents = Number(payment.amountKobo);
      if (currentCents === null || !Number.isSafeInteger(creditCents)) {
        throw new AppError('Invalid wallet balance.', 500, 'INVALID_BALANCE');
      }

      const newBalanceCents = currentCents + creditCents;
      const newBalance = (newBalanceCents / 100).toFixed(2);

      await user.update({ balance: newBalance }, { transaction: t });

      // The unique index on transactions.paymentId is a second, database-level
      // guarantee that this payment can only ever produce one ledger entry.
      await Transaction.create(
        {
          type: 'deposit',
          senderId: user.id,
          receiverId: user.id,
          amount: koboToNairaString(payment.amountKobo),
          paymentId: payment.id,
        },
        { transaction: t }
      );

      const paidAt = data.paid_at ? new Date(data.paid_at) : now();
      await payment.update(
        {
          status: 'success',
          providerReference: data.reference,
          paystackTransactionId: data.id != null ? String(data.id) : null,
          channel: typeof data.channel === 'string' ? data.channel : null,
          paidAt: Number.isNaN(paidAt.getTime()) ? now() : paidAt,
          verifiedAt: now(),
          failureReason: null,
          metadata: {
            ...(payment.metadata || {}),
            source,
          },
        },
        { transaction: t }
      );

      return {
        payment,
        credited: true,
        alreadyProcessed: false,
        balance: newBalance,
      };
    });
  }

  async function setPaymentStatusIfPending(paymentId, status, data) {
    return sequelize.transaction(async (t) => {
      const payment = await Payment.findByPk(paymentId, {
        transaction: t,
        lock: t.LOCK.UPDATE,
      });
      if (!payment) throw new AppError('Payment not found.', 404, 'PAYMENT_NOT_FOUND');
      if (payment.status === 'success') return payment;

      await payment.update(
        {
          status,
          failureReason: status === 'failed' ? `Paystack status: ${data.status}` : null,
          verifiedAt: now(),
        },
        { transaction: t }
      );
      return payment;
    });
  }

  async function verifyDeposit({ userId, reference }) {
    requireConfigured();

    const payment = await findOwnedPayment(userId, reference);

    if (payment.status === 'success') {
      const balance = await balanceFor(userId);
      return paymentView(payment, { balance, alreadyProcessed: true });
    }

    const providerReference = payment.providerReference || payment.reference;
    const data = await paystack.verifyTransaction(providerReference);

    if (!data || typeof data.reference !== 'string') {
      throw new AppError(
        'Paystack returned an invalid verification response.',
        502,
        'PAYSTACK_BAD_RESPONSE'
      );
    }

    if (data.status === 'success') {
      if (payment.providerReference && data.reference !== payment.providerReference) {
        throw new AppError(
          'Paystack reference does not match this payment.',
          409,
          'PAYMENT_REFERENCE_MISMATCH'
        );
      }

      const result = await creditVerifiedPayment(payment.id, data, { source: 'verify' });
      return paymentView(result.payment, {
        balance: result.balance,
        credited: result.credited,
        alreadyProcessed: result.alreadyProcessed,
      });
    }

    if (data.status === 'failed' || data.status === 'reversed') {
      const updated = await setPaymentStatusIfPending(payment.id, 'failed', data);
      const balance = await balanceFor(userId);
      return paymentView(updated, { balance });
    }

    if (data.status === 'abandoned') {
      const updated = await setPaymentStatusIfPending(payment.id, 'abandoned', data);
      const balance = await balanceFor(userId);
      return paymentView(updated, { balance });
    }

    // pending, ongoing, processing, queued, etc. — never credit.
    const balance = await balanceFor(userId);
    return paymentView(payment, { balance });
  }

  async function handleChargeSuccess(eventData) {
    requireConfigured();

    if (!eventData || typeof eventData.reference !== 'string') {
      return { ignored: true, reason: 'invalid_event_payload' };
    }

    const payment = await Payment.findOne({
      where: {
        [Op.or]: [
          { providerReference: eventData.reference },
          { reference: eventData.reference },
        ],
      },
    });

    if (!payment) {
      return { ignored: true, reason: 'unknown_reference' };
    }

    if (payment.status === 'success') {
      return { ignored: true, alreadyProcessed: true, payment };
    }

    // Never trust the webhook payload alone: confirm with Paystack first.
    const providerReference = payment.providerReference || payment.reference;
    const data = await paystack.verifyTransaction(providerReference);

    if (!data || data.status !== 'success') {
      return { ignored: true, reason: 'paystack_not_successful', payment };
    }

    if (data.reference !== providerReference) {
      throw new AppError(
        'Paystack reference does not match this payment.',
        409,
        'PAYMENT_REFERENCE_MISMATCH'
      );
    }

    const result = await creditVerifiedPayment(payment.id, data, { source: 'webhook' });
    return {
      ignored: false,
      credited: result.credited,
      alreadyProcessed: result.alreadyProcessed,
      payment: result.payment,
    };
  }

  async function handleWebhookEvent(event) {
    if (!event || typeof event !== 'object' || typeof event.event !== 'string') {
      throw new AppError('Invalid webhook payload.', 400, 'INVALID_WEBHOOK');
    }

    if (event.event === 'charge.success') {
      return handleChargeSuccess(event.data);
    }

    return { ignored: true, reason: 'unsupported_event' };
  }

  return {
    initializeDeposit,
    verifyDeposit,
    handleWebhookEvent,
    handleChargeSuccess,
    // Exported for tests and internal reuse.
    validateVerifiedTransaction,
  };
}

module.exports = { createPaymentService };
