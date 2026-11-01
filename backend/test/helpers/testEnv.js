// Loaded before any src module so config/env.js sees safe test values.
'use strict';

process.env.NODE_ENV = 'test';
process.env.DB_HOST = process.env.DB_HOST || '127.0.0.1';
process.env.DB_PORT = process.env.DB_PORT || '5432';
process.env.DB_USER = process.env.DB_USER || 'test';
process.env.DB_PASSWORD = process.env.DB_PASSWORD || 'test';
process.env.DB_NAME = process.env.DB_NAME || 'kobopay_test';
process.env.DB_SSL = 'false';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret';
process.env.PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY || 'sk_test_kobopay';
process.env.PAYSTACK_WEBHOOK_SECRET = process.env.PAYSTACK_WEBHOOK_SECRET || 'sk_test_kobopay';
process.env.PAYSTACK_CALLBACK_URL =
  process.env.PAYSTACK_CALLBACK_URL || 'http://localhost:3000/payment/callback';
process.env.CORS_ORIGIN = process.env.CORS_ORIGIN || 'http://localhost:3000';
process.env.PAYMENT_MIN_NGN = process.env.PAYMENT_MIN_NGN || '100';
process.env.PAYMENT_MAX_NGN = process.env.PAYMENT_MAX_NGN || '1000000';
