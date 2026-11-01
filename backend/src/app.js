// app.js — builds the Express application.
// Kept separate from server.js so tests can mount the app without connecting
// to PostgreSQL or opening a public port.
"use strict";

const express = require("express");
const cors = require("cors");
const config = require("./config/env");

const authRoutes = require("./routes/auth");
const accountRoutes = require("./routes/account");
const { createPaymentsRouter } = require("./routes/payments");
const { createPaystackWebhookRouter } = require("./routes/paystackWebhook");
const { paymentService } = require("./services/payments");

function createApp({ paymentService: injectedPaymentService } = {}) {
  const service = injectedPaymentService || paymentService;
  const app = express();

  // ── Middleware ──────────────────────────────────────────────────────────────

  // Only allow the configured frontend origin (not a wildcard) to call this API.
  app.use(cors({ origin: config.corsOrigin, credentials: true }));

  // IMPORTANT: the webhook needs the exact raw body, so it is mounted before
  // express.json(). Do not move this below the JSON parser.
  app.use(
    "/api/payments/paystack/webhook",
    createPaystackWebhookRouter(service),
  );

  // Parse JSON request bodies for every other route.
  app.use(express.json({ limit: "100kb" }));

  // ── Routes ──────────────────────────────────────────────────────────────────

  // Health check — no auth required.
  app.get("/api/health", (_req, res) => {
    res.json({ success: true, data: { app: "KoboPay", status: "ok" } });
  });

  app.use("/api/auth", authRoutes);
  app.use("/api/account", accountRoutes);
  app.use("/api/payments", createPaymentsRouter(service));

  // ── 404 handler ─────────────────────────────────────────────────────────────

  app.use((_req, res) => {
    res.status(404).json({ success: false, message: "Route not found." });
  });

  // ── Central error handler ───────────────────────────────────────────────────
  // Express recognises a 4-argument function as an error handler.
  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    // Map known Sequelize errors to proper HTTP status codes.
    if (err.name === "SequelizeUniqueConstraintError") {
      return res.status(409).json({
        success: false,
        message: "A record with that value already exists.",
      });
    }
    if (err.name === "SequelizeValidationError") {
      return res.status(400).json({
        success: false,
        message: err.errors.map((e) => e.message).join("; "),
      });
    }

    // AppError / PaystackError carry an intentional, client-safe status code.
    if (
      Number.isInteger(err.statusCode) &&
      err.statusCode >= 400 &&
      err.statusCode < 600
    ) {
      if (err.statusCode >= 500) {
        console.error("[KoboPay Error]", err.name, "-", err.message);
      }
      return res.status(err.statusCode).json({
        success: false,
        message:
          err.expose === false ? "An unexpected error occurred." : err.message,
      });
    }

    // Log only the error message/stack on the server for debugging.
    console.error("[KoboPay Error]", err);

    // Only include stack traces in development to avoid leaking internals.
    const isDev = config.nodeEnv === "development" || config.nodeEnv === "test";
    return res.status(500).json({
      success: false,
      message: "An unexpected error occurred.",
      ...(isDev && { detail: err.message, stack: err.stack }),
    });
  });

  return app;
}

module.exports = createApp;
