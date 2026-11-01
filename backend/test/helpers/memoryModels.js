// In-memory stand-ins for the Sequelize models used by paymentService.
// Transactions are serialized and restored on failure to exercise the
// exactly-once and rollback logic without a real PostgreSQL server.
'use strict';

const { Op } = require('sequelize');

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function matches(row, where) {
  for (const key of Reflect.ownKeys(where)) {
    const condition = where[key];

    if (key === Op.or) {
      if (!condition.some((part) => matches(row, part))) return false;
      continue;
    }

    if (key === Op.and) {
      if (!condition.every((part) => matches(row, part))) return false;
      continue;
    }

    if (condition && typeof condition === 'object' && !Array.isArray(condition)) {
      if (Op.ne && condition[Op.ne] !== undefined && row[key] === condition[Op.ne]) return false;
      if (condition[Op.gt] !== undefined && !(row[key] > condition[Op.gt])) return false;
      if (condition[Op.gte] !== undefined && !(row[key] >= condition[Op.gte])) return false;
      if (condition[Op.lt] !== undefined && !(row[key] < condition[Op.lt])) return false;
      if (condition[Op.lte] !== undefined && !(row[key] <= condition[Op.lte])) return false;
      continue;
    }

    if (row[key] !== condition) return false;
  }
  return true;
}

function createMemoryDb() {
  const state = {
    users: [],
    payments: [],
    transactions: [],
    nextId: { user: 1, payment: 1, transaction: 1 },
  };

  let mutex = Promise.resolve();

  function snapshot() {
    return clone(state);
  }

  function restore(snap) {
    state.users = snap.users;
    state.payments = snap.payments;
    state.transactions = snap.transactions;
    state.nextId = snap.nextId;
  }

  function transaction(fn) {
    const run = async () => {
      const snap = snapshot();
      try {
        return await fn({ LOCK: { UPDATE: 'UPDATE' } });
      } catch (err) {
        restore(snap);
        throw err;
      }
    };

    const result = mutex.then(run, run);
    mutex = result.catch(() => {});
    return result;
  }

  return { state, transaction, LOCK: { UPDATE: 'UPDATE' } };
}

function makeInstance(table, row) {
  if (row.update) return row;

  Object.defineProperty(row, 'update', {
    enumerable: false,
    value: async function update(values) {
      if (row.__failUpdate) throw new Error('simulated database write failure');
      Object.assign(row, values);
      row.updatedAt = new Date().toISOString();
      return row;
    },
  });

  Object.defineProperty(row, 'toJSON', {
    enumerable: false,
    value: function toJSON() {
      return { ...row };
    },
  });

  if (!table.includes(row)) table.push(row);
  return row;
}

function uniqueError() {
  const err = new Error('duplicate key value violates unique constraint');
  err.name = 'SequelizeUniqueConstraintError';
  return err;
}

function createPaymentModel(db) {
  const table = db.state.payments;

  function wrap(row) {
    return row ? makeInstance(table, row) : null;
  }

  return {
    async findOne({ where } = {}) {
      return wrap(table.find((row) => matches(row, where || {})) || null);
    },
    async findByPk(id) {
      return wrap(table.find((row) => row.id === id) || null);
    },
    async create(values) {
      if (
        table.some((row) => row.reference === values.reference) ||
        (values.providerReference &&
          table.some((row) => row.providerReference === values.providerReference)) ||
        (values.idempotencyKey &&
          table.some(
            (row) =>
              row.userId === values.userId &&
              row.idempotencyKey === values.idempotencyKey
          ))
      ) {
        throw uniqueError();
      }

      const now = new Date().toISOString();
      const row = {
        id: db.state.nextId.payment++,
        userId: values.userId,
        reference: values.reference,
        providerReference: values.providerReference ?? null,
        provider: values.provider || 'paystack',
        amountKobo: values.amountKobo,
        currency: values.currency || 'NGN',
        status: values.status || 'pending',
        accessCode: values.accessCode ?? null,
        authorizationUrl: values.authorizationUrl ?? null,
        paystackTransactionId: values.paystackTransactionId ?? null,
        channel: values.channel ?? null,
        idempotencyKey: values.idempotencyKey ?? null,
        failureReason: values.failureReason ?? null,
        paidAt: values.paidAt ?? null,
        verifiedAt: values.verifiedAt ?? null,
        metadata: values.metadata ?? null,
        createdAt: now,
        updatedAt: now,
      };

      table.push(row);
      return wrap(row);
    },
  };
}

function createUserModel(db) {
  const table = db.state.users;

  function wrap(row) {
    return row ? makeInstance(table, row) : null;
  }

  return {
    async findByPk(id) {
      return wrap(table.find((row) => row.id === id) || null);
    },
  };
}

function createTransactionModel(db) {
  const table = db.state.transactions;

  return {
    async create(values) {
      if (
        values.paymentId != null &&
        table.some((row) => row.paymentId === values.paymentId)
      ) {
        throw uniqueError();
      }

      const now = new Date().toISOString();
      const row = {
        id: db.state.nextId.transaction++,
        ...values,
        createdAt: now,
      };
      table.push(row);
      return row;
    },
  };
}

function createMemoryModels() {
  const db = createMemoryDb();
  return {
    db,
    sequelize: { transaction: db.transaction, LOCK: db.LOCK },
    Payment: createPaymentModel(db),
    User: createUserModel(db),
    Transaction: createTransactionModel(db),
  };
}

function seedUser(db, { id = 1, email = 'user@example.com', balance = '0.00' } = {}) {
  db.state.users.push({
    id,
    fullName: 'Test User',
    email,
    accountNumber: String(1000000000 + id),
    passwordHash: 'hash',
    pinHash: null,
    balance,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
  db.state.nextId.user = Math.max(db.state.nextId.user, id + 1);
}

module.exports = { createMemoryModels, seedUser, uniqueError };
