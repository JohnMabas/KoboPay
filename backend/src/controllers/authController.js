// controllers/authController.js — handles registration and login.
'use strict';

const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { User } = require('../models');
const config = require('../config/env');

// ── Helpers ───────────────────────────────────────────────────────────────────

// Generate a random 10-digit account number and verify it is not already taken.
async function generateUniqueAccountNumber() {
  const MAX_ATTEMPTS = 10;
  for (let i = 0; i < MAX_ATTEMPTS; i++) {
    const num = Math.floor(Math.random() * 9_000_000_000) + 1_000_000_000;
    const accountNumber = String(num);
    const existing = await User.findOne({ where: { accountNumber } });
    if (!existing) return accountNumber;
  }
  throw new Error('Could not generate a unique account number. Try again.');
}

// ── Controllers ───────────────────────────────────────────────────────────────

/**
 * POST /api/auth/register
 * Body: { full_name, email, password }
 *
 * Validates fields, hashes the password, creates the user, and returns the
 * new account details.
 */
async function register(req, res, next) {
  try {
    const { full_name, email, password } = req.body;

    // ── Field validation ────────────────────────────────────────────────────
    if (!full_name || typeof full_name !== 'string' || !full_name.trim()) {
      return res.status(400).json({ success: false, message: 'full_name is required.' });
    }
    if (!email || typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ success: false, message: 'A valid email is required.' });
    }
    if (!password || typeof password !== 'string' || password.length < 6) {
      return res
        .status(400)
        .json({ success: false, message: 'password must be at least 6 characters.' });
    }

    // ── Check email not already registered ──────────────────────────────────
    const normalEmail = email.toLowerCase().trim();
    const existing = await User.findOne({ where: { email: normalEmail } });
    if (existing) {
      return res.status(409).json({ success: false, message: 'Email is already registered.' });
    }

    // ── Hash password and create the account ────────────────────────────────
    const passwordHash = await bcrypt.hash(password, config.saltRounds);
    const accountNumber = await generateUniqueAccountNumber();

    const user = await User.create({
      fullName: full_name.trim(),
      email: normalEmail,
      passwordHash,
      accountNumber,
    });

    return res.status(201).json({
      success: true,
      data: {
        id: user.id,
        full_name: user.fullName,
        email: user.email,
        account_number: user.accountNumber,
        balance: user.balance,
      },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/auth/login
 * Body: { email, password }
 */
async function login(req, res, next) {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'email and password are required.' });
    }

    const user = await User.scope('withSecrets').findOne({
      where: { email: email.toLowerCase().trim() },
    });

    if (!user) {
      return res.status(401).json({ success: false, message: 'Invalid email or password.' });
    }

    const passwordMatches = await bcrypt.compare(password, user.passwordHash);
    if (!passwordMatches) {
      return res.status(401).json({ success: false, message: 'Invalid email or password.' });
    }

    const token = jwt.sign({ id: user.id }, config.jwtSecret, {
      expiresIn: config.jwtExpiresIn,
    });

    return res.status(200).json({
      success: true,
      data: {
        token,
        user: {
          id: user.id,
          full_name: user.fullName,
          email: user.email,
          account_number: user.accountNumber,
        },
      },
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { register, login };
