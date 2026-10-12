// routes/account.js — all routes under /api/account require authentication.
'use strict';

const { Router } = require('express');
const auth = require('../middleware/auth');
const {
  getBalance,
  lookupAccount,
  deposit,
  createPin,
  updatePin,
  transfer,
  getTransactions,
} = require('../controllers/accountController');

const router = Router();

// Apply the auth middleware to every route in this file.
router.use(auth);

router.get('/balance', getBalance);
router.get('/lookup/:account_number', lookupAccount);
router.post('/deposit', deposit);
router.post('/pin', createPin);
router.put('/pin', updatePin);
router.post('/transfer', transfer);
router.get('/transactions', getTransactions);

module.exports = router;
