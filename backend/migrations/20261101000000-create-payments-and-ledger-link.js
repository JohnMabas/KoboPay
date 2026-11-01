// Adds Paystack payment tracking and links one payment to at most one wallet
// ledger row. Written with IF NOT EXISTS guards because the app's existing
// sequelize.sync() startup may have already created the new payment table.
'use strict';

module.exports = {
  async up(queryInterface, transaction) {
    const { sequelize } = queryInterface;
    const q = (sql) => sequelize.query(sql, { transaction });

    await q(`
      CREATE TABLE IF NOT EXISTS payments (
        id SERIAL PRIMARY KEY,
        "userId" INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
        reference VARCHAR(100) NOT NULL UNIQUE,
        "providerReference" VARCHAR(100) UNIQUE,
        provider VARCHAR(20) NOT NULL DEFAULT 'paystack',
        "amountKobo" BIGINT NOT NULL CHECK ("amountKobo" > 0),
        currency VARCHAR(3) NOT NULL DEFAULT 'NGN',
        status VARCHAR(20) NOT NULL DEFAULT 'pending'
          CHECK (status IN ('pending', 'success', 'failed', 'abandoned')),
        "accessCode" VARCHAR(100),
        "authorizationUrl" TEXT,
        "paystackTransactionId" BIGINT,
        channel VARCHAR(30),
        "idempotencyKey" VARCHAR(255),
        "failureReason" VARCHAR(255),
        "paidAt" TIMESTAMPTZ,
        "verifiedAt" TIMESTAMPTZ,
        metadata JSONB,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await q('CREATE INDEX IF NOT EXISTS payments_user_id ON payments ("userId");');
    await q('CREATE INDEX IF NOT EXISTS payments_status ON payments (status);');
    await q('CREATE INDEX IF NOT EXISTS payments_created_at ON payments ("createdAt");');
    await q(`
      CREATE UNIQUE INDEX IF NOT EXISTS payments_user_idempotency_unique
        ON payments ("userId", "idempotencyKey")
        WHERE "idempotencyKey" IS NOT NULL;
    `);

    await q('ALTER TABLE transactions ADD COLUMN IF NOT EXISTS "paymentId" INTEGER;');

    await q(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'transactions_paymentId_fkey'
        ) THEN
          ALTER TABLE transactions
            ADD CONSTRAINT "transactions_paymentId_fkey"
            FOREIGN KEY ("paymentId") REFERENCES payments(id)
            ON DELETE SET NULL ON UPDATE CASCADE;
        END IF;
      END
      $$;
    `);

    await q(`
      CREATE UNIQUE INDEX IF NOT EXISTS transactions_payment_id_unique
        ON transactions ("paymentId")
        WHERE "paymentId" IS NOT NULL;
    `);
  },

  async down(queryInterface, transaction) {
    const { sequelize } = queryInterface;
    const q = (sql) => sequelize.query(sql, { transaction });

    await q('DROP INDEX IF EXISTS transactions_payment_id_unique;');

    await q(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'transactions_paymentId_fkey'
        ) THEN
          ALTER TABLE transactions DROP CONSTRAINT "transactions_paymentId_fkey";
        END IF;
      END
      $$;
    `);

    await q('ALTER TABLE transactions DROP COLUMN IF EXISTS "paymentId";');
    await q('DROP TABLE IF EXISTS payments;');
  },
};
