// routes/payments.js — authenticated Paystack initialization and verification.
'use strict';

const { Router } = require('express');
const auth = require('../middleware/auth');
const config = require('../config/env');
const { createRateLimiter } = require('../middleware/rateLimit');
const { createPaymentController } = require('../controllers/paymentController');
const { paymentService } = require('../services/payments');

function createPaymentsRouter(service = paymentService) {
  const router = Router();
  const controller = createPaymentController(service);

  const initializeLimiter = createRateLimiter({
    windowMs: config.paymentRateLimitWindowMs,
    max: config.paymentInitRateLimit,
    keyPrefix: 'payment-init',
  });

  const verifyLimiter = createRateLimiter({
    windowMs: config.paymentRateLimitWindowMs,
    max: config.paymentVerifyRateLimit,
    keyPrefix: 'payment-verify',
  });

  router.use(auth);

  router.post('/paystack/initialize', initializeLimiter, controller.initialize);
  router.get('/paystack/verify/:reference', verifyLimiter, controller.verify);

  return router;
}

module.exports = { createPaymentsRouter };
