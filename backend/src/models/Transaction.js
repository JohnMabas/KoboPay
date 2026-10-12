// Transaction.js — defines the transactions table schema.
'use strict';

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Transaction = sequelize.define(
    'Transaction',
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      // "deposit" — cash added to an account (depositor balance is NOT deducted)
      // "transfer" — money moved between two accounts
      type: {
        type: DataTypes.ENUM('deposit', 'transfer'),
        allowNull: false,
      },
      // The user who initiated the action (depositor or sender).
      senderId: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      // The account that received the money.
      receiverId: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      amount: {
        type: DataTypes.DECIMAL(14, 2),
        allowNull: false,
        validate: { min: 0.01 },
      },
    },
    {
      tableName: 'transactions',
      // Only createdAt is needed; no updatedAt on immutable records.
      timestamps: true,
      updatedAt: false,
      indexes: [
        { fields: ['senderId'] },
        { fields: ['receiverId'] },
      ],
    }
  );

  return Transaction;
};
