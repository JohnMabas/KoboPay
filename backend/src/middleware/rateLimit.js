// middleware/rateLimit.js — small dependency-free fixed-window limiter.
// Keeps existing security dependencies unchanged; suitable for a single
// Railway instance. Use a shared store (Redis) if you scale horizontally.
'use strict';

function createRateLimiter({ windowMs, max, keyPrefix = '' }) {
  const buckets = new Map();

  // Opportunistic cleanup; unref() keeps the timer from holding the process.
  const cleanup = setInterval(() => {
    const cutoff = Date.now() - windowMs;
    for (const [key, bucket] of buckets) {
      if (bucket.start <= cutoff) buckets.delete(key);
    }
  }, Math.max(windowMs, 60000));
  if (typeof cleanup.unref === 'function') cleanup.unref();

  return function rateLimiter(req, res, next) {
    const identity = req.user && req.user.id ? `user:${req.user.id}` : `ip:${req.ip}`;
    const key = `${keyPrefix}:${identity}`;
    const current = Date.now();
    let bucket = buckets.get(key);

    if (!bucket || current - bucket.start >= windowMs) {
      bucket = { start: current, count: 0 };
      buckets.set(key, bucket);
    }

    bucket.count += 1;

    if (bucket.count > max) {
      const retryAfter = Math.ceil((bucket.start + windowMs - current) / 1000);
      res.set('Retry-After', String(Math.max(retryAfter, 1)));
      return res.status(429).json({
        success: false,
        message: 'Too many payment requests. Please try again shortly.',
      });
    }

    return next();
  };
}

module.exports = { createRateLimiter };
