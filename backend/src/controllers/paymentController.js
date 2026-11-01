// controllers/paymentController.js — HTTP layer for Paystack deposits.
'use strict';

function createPaymentController(paymentService) {
  async function initialize(req, res, next) {
    try {
      const data = await paymentService.initializeDeposit({
        userId: req.user.id,
        amount: req.body ? req.body.amount : undefined,
        idempotencyKey: req.get('Idempotency-Key'),
      });

      return res.status(201).json({ success: true, data });
    } catch (err) {
      return next(err);
    }
  }

  async function verify(req, res, next) {
    try {
      const data = await paymentService.verifyDeposit({
        userId: req.user.id,
        reference: req.params.reference,
      });

      return res.status(200).json({ success: true, data });
    } catch (err) {
      return next(err);
    }
  }

  return { initialize, verify };
}

module.exports = { createPaymentController };
