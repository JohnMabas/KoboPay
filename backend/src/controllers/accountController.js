// controllers/accountController.js — handles all account operations:
// balance, lookup, deposit, transfer, PIN create/update, transaction history.
'use strict';

const bcrypt = require('bcrypt');
const { Op } = require('sequelize');
const { User, Transaction, sequelize } = require('../models');
const config = require('../config/env');

// ── Helpers ───────────────────────────────────────────────────────────────────

// Validate that a string is exactly 4 digits.
function isValidPin(pin) {
  return typeof pin === 'string' && /^\d{4}$/.test(pin);
}

// Validate that a string is exactly 10 digits.
function isValidAccountNumber(num) {
  return typeof num === 'string' && /^\d{10}$/.test(num);
}

// Validate amount: must be a positive number with at most 2 decimal places.
function isValidAmount(value) {
  const n = Number(value);
  if (!isFinite(n) || n <= 0) return false;
  // Check at most 2 decimal places
  return /^\d+(\.\d{1,2})?$/.test(String(value));
}

// Safe integer-cent arithmetic to avoid floating-point errors on DECIMAL values.
// Sequelize returns DECIMAL columns as strings (e.g. "1500.00").
function toCents(str) {
  // Multiply by 100 using string manipulation to keep precision.
  return Math.round(parseFloat(str) * 100);
}
function fromCents(cents) {
  return (cents / 100).toFixed(2);
}

// ── GET /api/account/balance ──────────────────────────────────────────────────

async function getBalance(req, res, next) {
  try {
    // defaultScope already excludes passwordHash and pinHash.
    // We use withSecrets only to check whether pinHash is set, but we can
    // do that by fetching pinHash separately without leaking the hash.
    const user = await User.scope('withSecrets').findByPk(req.user.id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found.' });

    return res.status(200).json({
      success: true,
      data: {
        id: user.id,
        full_name: user.fullName,
        email: user.email,
        account_number: user.accountNumber,
        balance: user.balance,                 // string e.g. "1500.00"
        has_pin: user.pinHash !== null,         // boolean for the frontend
      },
    });
  } catch (err) {
    next(err);
  }
}

// ── GET /api/account/lookup/:account_number ───────────────────────────────────

async function lookupAccount(req, res, next) {
  try {
    const { account_number } = req.params;

    if (!isValidAccountNumber(account_number)) {
      return res
        .status(400)
        .json({ success: false, message: 'Account number must be exactly 10 digits.' });
    }

    const user = await User.findOne({
      where: { accountNumber: account_number },
      attributes: ['fullName', 'accountNumber'],
    });

    if (!user) {
      return res.status(404).json({ success: false, message: 'Account not found.' });
    }

    return res.status(200).json({
      success: true,
      data: {
        account_number: user.accountNumber,
        full_name: user.fullName,
      },
    });
  } catch (err) {
    next(err);
  }
}

// ── POST /api/account/deposit ─────────────────────────────────────────────────
// Adds funds to the target account. The depositor's balance is NOT deducted
// (behaves like a cash deposit at a bank counter).

async function deposit(req, res, next) {
  try {
    const { account_number, amount } = req.body;

    if (!account_number || !isValidAccountNumber(account_number)) {
      return res
        .status(400)
        .json({ success: false, message: 'account_number must be exactly 10 digits.' });
    }
    if (!amount || !isValidAmount(amount)) {
      return res
        .status(400)
        .json({ success: false, message: 'amount must be a positive number with at most 2 decimal places.' });
    }

    // Use a managed Sequelize transaction so the balance update and the
    // transaction record are written atomically — if either fails, both roll back.
    const result = await sequelize.transaction(async (t) => {
      // Lock the receiver row (SELECT … FOR UPDATE) to prevent concurrent
      // deposits from causing a lost-update race condition.
      const receiver = await User.scope('withSecrets').findOne({
        where: { accountNumber: account_number },
        transaction: t,
        lock: t.LOCK.UPDATE,
      });

      if (!receiver) {
        // Throwing inside a managed transaction triggers an automatic rollback.
        const err = new Error('Destination account not found.');
        err.statusCode = 404;
        throw err;
      }

      // Integer-cent arithmetic to avoid floating-point errors.
      const newBalanceCents = toCents(receiver.balance) + toCents(amount);
      await receiver.update({ balance: fromCents(newBalanceCents) }, { transaction: t });

      // Record the transaction. senderId = the logged-in user making the deposit.
      const txn = await Transaction.create(
        {
          type: 'deposit',
          senderId: req.user.id,
          receiverId: receiver.id,
          amount: parseFloat(amount).toFixed(2),
        },
        { transaction: t }
      );

      return { receiver, txn };
    });

    return res.status(200).json({
      success: true,
      data: {
        message: `Deposited ${parseFloat(amount).toFixed(2)} to ${result.receiver.fullName}`,
        receiver_name: result.receiver.fullName,
        receiver_account_number: result.receiver.accountNumber,
        amount: parseFloat(amount).toFixed(2),
        transaction_id: result.txn.id,
      },
    });
  } catch (err) {
    // Re-throw errors with a known statusCode so the error handler can use them.
    if (err.statusCode) {
      return res.status(err.statusCode).json({ success: false, message: err.message });
    }
    next(err);
  }
}

// ── POST /api/account/pin — create PIN ────────────────────────────────────────

async function createPin(req, res, next) {
  try {
    const { pin } = req.body;

    if (!isValidPin(pin)) {
      return res.status(400).json({ success: false, message: 'PIN must be exactly 4 digits.' });
    }

    const user = await User.scope('withSecrets').findByPk(req.user.id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found.' });

    if (user.pinHash !== null) {
      return res
        .status(400)
        .json({ success: false, message: 'A PIN already exists. Use PUT /api/account/pin to change it.' });
    }

    const pinHash = await bcrypt.hash(pin, config.saltRounds);
    await user.update({ pinHash });

    return res.status(200).json({ success: true, data: { message: 'PIN created successfully.' } });
  } catch (err) {
    next(err);
  }
}

// ── PUT /api/account/pin — change PIN ────────────────────────────────────────

async function updatePin(req, res, next) {
  try {
    const { current_pin, new_pin } = req.body;

    if (!isValidPin(current_pin) || !isValidPin(new_pin)) {
      return res
        .status(400)
        .json({ success: false, message: 'current_pin and new_pin must each be exactly 4 digits.' });
    }

    const user = await User.scope('withSecrets').findByPk(req.user.id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found.' });

    if (user.pinHash === null) {
      return res
        .status(400)
        .json({ success: false, message: 'No PIN set yet. Use POST /api/account/pin to create one.' });
    }

    const pinMatches = await bcrypt.compare(current_pin, user.pinHash);
    if (!pinMatches) {
      return res.status(403).json({ success: false, message: 'Current PIN is incorrect.' });
    }

    const newPinHash = await bcrypt.hash(new_pin, config.saltRounds);
    await user.update({ pinHash: newPinHash });

    return res.status(200).json({ success: true, data: { message: 'PIN updated successfully.' } });
  } catch (err) {
    next(err);
  }
}

// ── POST /api/account/transfer ────────────────────────────────────────────────
// Transfers money from the logged-in user to another account.

async function transfer(req, res, next) {
  try {
    const { to_account_number, amount, pin } = req.body;

    // Input validation
    if (!to_account_number || !isValidAccountNumber(to_account_number)) {
      return res
        .status(400)
        .json({ success: false, message: 'to_account_number must be exactly 10 digits.' });
    }
    if (!amount || !isValidAmount(amount)) {
      return res
        .status(400)
        .json({ success: false, message: 'amount must be a positive number with at most 2 decimal places.' });
    }
    if (!isValidPin(pin)) {
      return res.status(400).json({ success: false, message: 'PIN must be exactly 4 digits.' });
    }

    // Fetch the sender with secrets to verify PIN and check balance.
    const sender = await User.scope('withSecrets').findByPk(req.user.id);
    if (!sender) return res.status(404).json({ success: false, message: 'User not found.' });

    // PIN must be set before transferring.
    if (sender.pinHash === null) {
      return res
        .status(403)
        .json({ success: false, message: 'Please create a PIN before making transfers.' });
    }

    const pinMatches = await bcrypt.compare(pin, sender.pinHash);
    if (!pinMatches) {
      return res.status(403).json({ success: false, message: 'Incorrect PIN.' });
    }

    // Cannot transfer to own account.
    if (sender.accountNumber === to_account_number) {
      return res
        .status(400)
        .json({ success: false, message: 'Cannot transfer to your own account.' });
    }

    const transferAmountCents = toCents(amount);

    // Use a managed Sequelize transaction so all DB changes are atomic.
    const result = await sequelize.transaction(async (t) => {
      // Lock both accounts in ascending id order to prevent deadlocks when two
      // users transfer to each other simultaneously.
      const receiver = await User.scope('withSecrets').findOne({
        where: { accountNumber: to_account_number },
        transaction: t,
        lock: t.LOCK.UPDATE,
      });

      if (!receiver) {
        const err = new Error('Recipient account not found.');
        err.statusCode = 404;
        throw err;
      }

      // Re-fetch sender inside the transaction and lock in id order.
      // Lower id is locked first regardless of who is sender/receiver.
      const [first, second] =
        sender.id < receiver.id ? [sender.id, receiver.id] : [receiver.id, sender.id];

      const lockedFirst = await User.scope('withSecrets').findByPk(first, {
        transaction: t,
        lock: t.LOCK.UPDATE,
      });
      const lockedSecond = await User.scope('withSecrets').findByPk(second, {
        transaction: t,
        lock: t.LOCK.UPDATE,
      });

      // Map back to named variables.
      const lockedSender = lockedFirst.id === sender.id ? lockedFirst : lockedSecond;
      const lockedReceiver = lockedFirst.id === receiver.id ? lockedFirst : lockedSecond;

      // Check balance after locking (re-read ensures accuracy).
      const senderBalanceCents = toCents(lockedSender.balance);
      if (senderBalanceCents < transferAmountCents) {
        const err = new Error('Insufficient balance.');
        err.statusCode = 400;
        throw err;
      }

      // Update both balances.
      await lockedSender.update(
        { balance: fromCents(senderBalanceCents - transferAmountCents) },
        { transaction: t }
      );
      await lockedReceiver.update(
        { balance: fromCents(toCents(lockedReceiver.balance) + transferAmountCents) },
        { transaction: t }
      );

      // Record the transaction.
      const txn = await Transaction.create(
        {
          type: 'transfer',
          senderId: sender.id,
          receiverId: receiver.id,
          amount: parseFloat(amount).toFixed(2),
        },
        { transaction: t }
      );

      return { receiver: lockedReceiver, txn };
    });

    return res.status(200).json({
      success: true,
      data: {
        message: `Transferred ${parseFloat(amount).toFixed(2)} to ${result.receiver.fullName}`,
        receiver_name: result.receiver.fullName,
        receiver_account_number: result.receiver.accountNumber,
        amount: parseFloat(amount).toFixed(2),
        transaction_id: result.txn.id,
      },
    });
  } catch (err) {
    if (err.statusCode) {
      return res.status(err.statusCode).json({ success: false, message: err.message });
    }
    next(err);
  }
}

// ── GET /api/account/transactions ────────────────────────────────────────────

async function getTransactions(req, res, next) {
  try {
    let { page = '1', limit = '10' } = req.query;

    // Validate pagination params are positive integers.
    page = parseInt(page, 10);
    limit = parseInt(limit, 10);

    if (!Number.isInteger(page) || page < 1) {
      return res.status(400).json({ success: false, message: 'page must be a positive integer.' });
    }
    if (!Number.isInteger(limit) || limit < 1) {
      return res.status(400).json({ success: false, message: 'limit must be a positive integer.' });
    }

    // Cap limit to prevent huge responses.
    if (limit > 50) limit = 50;

    const userId = req.user.id;
    const offset = (page - 1) * limit;

    // Fetch transactions where the logged-in user is sender OR receiver.
    // Include sender and receiver with only their display fields.
    const { rows, count } = await Transaction.findAndCountAll({
      where: {
        [Op.or]: [{ senderId: userId }, { receiverId: userId }],
      },
      include: [
        {
          model: User,
          as: 'sender',
          attributes: ['fullName', 'accountNumber'],
        },
        {
          model: User,
          as: 'receiver',
          attributes: ['fullName', 'accountNumber'],
        },
      ],
      order: [['createdAt', 'DESC']],
      limit,
      offset,
      // distinct: true ensures the total count is correct when using includes.
      distinct: true,
    });

    // Shape each transaction from the logged-in user's point of view.
    const transactions = rows.map((txn) => {
      const isSender = txn.senderId === userId;
      const isReceiver = txn.receiverId === userId;
      const isSelfDeposit = txn.type === 'deposit' && isSender && isReceiver;

      let direction;
      let description;

      if (txn.type === 'deposit') {
        if (isSelfDeposit) {
          direction = 'credit';
          description = 'Deposit';
        } else if (isSender) {
          // Deposited into someone else's account — depositor balance unchanged.
          direction = 'neutral';
          description = `Deposit to ${txn.receiver.fullName} (${txn.receiver.accountNumber})`;
        } else {
          // Received a deposit from someone else.
          direction = 'credit';
          description = `Deposit from ${txn.sender.fullName}`;
        }
      } else {
        // transfer
        if (isSender) {
          direction = 'debit';
          description = `Sent to ${txn.receiver.fullName} (${txn.receiver.accountNumber})`;
        } else {
          direction = 'credit';
          description = `Received from ${txn.sender.fullName}`;
        }
      }

      return {
        id: txn.id,
        direction,
        type: txn.type,
        amount: txn.amount,            // string e.g. "2500.00"
        sender_name: txn.sender.fullName,
        sender_account_number: txn.sender.accountNumber,
        receiver_name: txn.receiver.fullName,
        receiver_account_number: txn.receiver.accountNumber,
        description,
        created_at: txn.createdAt,
      };
    });

    return res.status(200).json({
      success: true,
      data: {
        transactions,
        page,
        limit,
        total: count,
      },
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getBalance,
  lookupAccount,
  deposit,
  createPin,
  updatePin,
  transfer,
  getTransactions,
};
