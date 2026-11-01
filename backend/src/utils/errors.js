// utils/errors.js — errors that are safe to expose to API clients.
'use strict';

class AppError extends Error {
  constructor(message, statusCode = 500, code = 'APP_ERROR') {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    this.expose = statusCode < 500;
  }
}

module.exports = { AppError };
