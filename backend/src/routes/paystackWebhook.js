// routes/paystackWebhook.js — raw-body webhook route.
// Must be mounted BEFORE express.json() so the exact bytes Paystack signed are
// available for HMAC verification.
'use strict';

const express = require('express');
const config = require('../config/env');
const { isValidPaystackSignature } = require('../utils/paystackSignature');
const { AppError } = require('../utils/errors');
const { paymentService } = require('../services/payments');

function createPaystackWebhookRouter(service = paymentService) {
  const router = express.Router();

  router.post(
    '/',
    express.raw({ type: 'application/json', limit: '1mb' }),
    async (req, res) => {
      const rawBody = Buffer.isBuffer(req.body) ? req.body : null;

      if (!rawBody || rawBody.length === 0) {
        return res.status(400).json({ success: false, message: 'Missing request body.' });
      }

      if (!config.paystackWebhookSecret) {
        return res
          .status(503)
          .json({ success: false, message: 'Paystack webhook is not configured.' });
      }

      const signature = req.get('x-paystack-signature');
      if (!isValidPaystackSignature(rawBody, signature, config.paystackWebhookSecret)) {
        return res.status(401).json({ success: false, message: 'Invalid webhook signature.' });
      }

      let event;
      try {
        event = JSON.parse(rawBody.toString('utf8'));
      } catch {
        return res.status(400).json({ success: false, message: 'Invalid webhook payload.' });
      }

      try {
        const result = await service.handleWebhookEvent(event);
        return res.status(200).json({ success: true, data: { received: true, ...result } });
      } catch (err) {
        if (err instanceof AppError && err.statusCode < 500) {
          return res
            .status(err.statusCode)
            .json({ success: false, message: err.message });
        }

        // 5xx means "try again later" for Paystack's retry mechanism.
        console.error('[KoboPay Webhook] Processing failed:', err.message);
        return res.status(502).json({ success: false, message: 'Webhook processing failed.' });
      }
    }
  );

  return router;
}

module.exports = { createPaystackWebhookRouter };
