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
    // Math.random() gives enough entropy for 10 digits in development.
    const num = Math.floor(Math.random() * 9_000_000_000) + 1_000_000_000;
    const accountNumber = String(num);
    // Use the withSecrets scope so the defaultScope attribute exclusion doesn't
    // interfere — we only need a count here anyway.
    const existing = await User.findOne({ where: { accountNumber } });
    if (!existing) return accountNumber;
  }
  throw new Error('Could not generate a unique account number. Try again.');
}

// ── Controllers ───────────────────────────────────────────────────────────────

/**
 * POST /api/auth/register
 * Body: { full_name, email, password }
 */
async function register(req, res, next) {
  try {
    const { full_name, email, password } = req.body;

    // Basic validation
    if (!full_name || typeof full_name !== 'string' || !full_name.trim()) {
      return res.status(400).json({ success: false, message: 'full_name is required.' });
    }
    if (!email || typeof email !== 'string') {
      return res.status(400).json({ success: false, message: 'email is required.' });
    }
    if (!password || typeof password !== 'string' || password.length < 6) {
      return res
        .status(400)
        .json({ success: false, message: 'password must be at least 6 characters.' });
    }

    const passwordHash = await bcrypt.hash(password, config.saltRounds);
    const accountNumber = await generateUniqueAccountNumber();

    // Sequelize will throw SequelizeUniqueConstraintError if the email is taken —
    // the central error handler converts that to a 409.
    const user = await User.create({
      fullName: full_name.trim(),
      email: email.toLowerCase().trim(),
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

    // Use the withSecrets scope so we can access passwordHash.
    const user = await User.scope('withSecrets').findOne({
      where: { email: email.toLowerCase().trim() },
    });

    if (!user) {
      // Return the same message for wrong email or wrong password to avoid
      // leaking which field was incorrect.
      return res.status(401).json({ success: false, message: 'Invalid email or password.' });
    }

    const passwordMatches = await bcrypt.compare(password, user.passwordHash);
    if (!passwordMatches) {
      return res.status(401).json({ success: false, message: 'Invalid email or password.' });
    }

    // Sign a JWT containing just enough info for the middleware (user id).
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
