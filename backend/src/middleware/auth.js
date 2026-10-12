// middleware/auth.js — verifies the JWT sent in the Authorization header.
// Attaches the decoded payload to req.user so controllers can read req.user.id.
'use strict';

const jwt = require('jsonwebtoken');
const config = require('../config/env');

function authMiddleware(req, res, next) {
  // Expect header: Authorization: Bearer <token>
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      success: false,
      message: 'No token provided. Please log in.',
    });
  }

  const token = authHeader.split(' ')[1];

  try {
    // jwt.verify throws if the token is expired or tampered with.
    const payload = jwt.verify(token, config.jwtSecret);
    // Attach the user id (and any other claims) to the request.
    req.user = payload;
    next();
  } catch (err) {
    return res.status(401).json({
      success: false,
      message: 'Invalid or expired token. Please log in again.',
    });
  }
}

module.exports = authMiddleware;
