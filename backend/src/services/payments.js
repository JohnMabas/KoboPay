// services/payments.js — production wiring for the payment service.
'use strict';

const config = require('../config/env');
const { Payment, User, Transaction, sequelize } = require('../models');
const { paystackClient } = require('./paystackClient');
const { createPaymentService } = require('./paymentService');

const paymentService = createPaymentService({
  Payment,
  User,
  Transaction,
  sequelize,
  paystack: paystackClient,
  config,
});

module.exports = { paymentService };
