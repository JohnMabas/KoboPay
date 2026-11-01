// models/index.js — loads all models, sets up associations, and re-exports
// them alongside the sequelize instance.
'use strict';

const sequelize = require('../config/database');

// Load each model factory and pass the shared sequelize instance.
const User = require('./User')(sequelize);
const Transaction = require('./Transaction')(sequelize);
const Payment = require('./Payment')(sequelize);

// ── Associations ──────────────────────────────────────────────────────────────
// A User can initiate many transactions (as sender/depositor).
User.hasMany(Transaction, { foreignKey: 'senderId', as: 'sentTransactions' });
// A User can receive many transactions.
User.hasMany(Transaction, { foreignKey: 'receiverId', as: 'receivedTransactions' });
// Each Transaction belongs to a sender.
Transaction.belongsTo(User, { foreignKey: 'senderId', as: 'sender' });
// Each Transaction belongs to a receiver.
Transaction.belongsTo(User, { foreignKey: 'receiverId', as: 'receiver' });

// A User can have many Paystack payment attempts.
User.hasMany(Payment, { foreignKey: 'userId', as: 'payments' });
Payment.belongsTo(User, { foreignKey: 'userId', as: 'user' });

// One successful payment produces at most one wallet ledger entry. The unique
// index on transactions.paymentId enforces this at the database level.
Payment.hasOne(Transaction, { foreignKey: 'paymentId', as: 'ledgerTransaction' });
Transaction.belongsTo(Payment, { foreignKey: 'paymentId', as: 'payment' });

module.exports = { sequelize, User, Transaction, Payment };
