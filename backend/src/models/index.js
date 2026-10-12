// models/index.js — loads all models, sets up associations, and re-exports
// them alongside the sequelize instance.
'use strict';

const sequelize = require('../config/database');

// Load each model factory and pass the shared sequelize instance.
const User = require('./User')(sequelize);
const Transaction = require('./Transaction')(sequelize);

// ── Associations ──────────────────────────────────────────────────────────────
// A User can initiate many transactions (as sender/depositor).
User.hasMany(Transaction, { foreignKey: 'senderId', as: 'sentTransactions' });
// A User can receive many transactions.
User.hasMany(Transaction, { foreignKey: 'receiverId', as: 'receivedTransactions' });
// Each Transaction belongs to a sender.
Transaction.belongsTo(User, { foreignKey: 'senderId', as: 'sender' });
// Each Transaction belongs to a receiver.
Transaction.belongsTo(User, { foreignKey: 'receiverId', as: 'receiver' });

module.exports = { sequelize, User, Transaction };
