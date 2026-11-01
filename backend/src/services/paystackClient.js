// services/paystackClient.js — server-side Paystack API client.
// Uses Node's built-in fetch (Node 18+) with an explicit timeout. No secret is
// ever returned to controllers or logged.
'use strict';

const config = require('../config/env');
const { AppError } = require('../utils/errors');

class PaystackError extends AppError {
  constructor(message, code, statusCode = 502) {
    super(message, statusCode, code);
    this.name = 'PaystackError';
  }
}

function createPaystackClient({
  secretKey = config.paystackSecretKey,
  baseUrl = config.paystackBaseUrl,
  timeoutMs = config.paystackTimeoutMs,
  fetchImpl = globalThis.fetch,
} = {}) {
  function assertConfigured() {
    if (!secretKey) {
      throw new PaystackError(
        'Paystack is not configured on the server.',
        'PAYSTACK_NOT_CONFIGURED',
        503
      );
    }
  }

  async function request(path, { method = 'GET', body } = {}) {
    assertConfigured();

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetchImpl(`${baseUrl}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${secretKey}`,
          'Content-Type': 'application/json',
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal,
      });

      let payload = null;
      try {
        payload = await response.json();
      } catch {
        throw new PaystackError(
          'Paystack returned an unreadable response.',
          'PAYSTACK_BAD_RESPONSE',
          502
        );
      }

      if (!response.ok || !payload || payload.status !== true) {
        const message =
          payload && typeof payload.message === 'string'
            ? payload.message
            : 'Paystack rejected the request.';
        throw new PaystackError(message, 'PAYSTACK_API_ERROR', 502);
      }

      return payload.data;
    } catch (err) {
      if (err instanceof PaystackError) throw err;
      if (err.name === 'AbortError') {
        throw new PaystackError('Paystack request timed out.', 'PAYSTACK_TIMEOUT', 504);
      }
      throw new PaystackError(
        'Could not reach Paystack. Please try again.',
        'PAYSTACK_UNAVAILABLE',
        502
      );
    } finally {
      clearTimeout(timer);
    }
  }

  async function initializeTransaction({ email, amountKobo, reference, callbackUrl, metadata }) {
    return request('/transaction/initialize', {
      method: 'POST',
      body: {
        email,
        amount: amountKobo, // Paystack expects integer kobo.
        currency: 'NGN',
        reference,
        callback_url: callbackUrl,
        metadata,
      },
    });
  }

  async function verifyTransaction(reference) {
    return request(`/transaction/verify/${encodeURIComponent(reference)}`);
  }

  function isConfigured() {
    return Boolean(secretKey);
  }

  return { initializeTransaction, verifyTransaction, isConfigured };
}

module.exports = { createPaystackClient, PaystackError, paystackClient: createPaystackClient() };
