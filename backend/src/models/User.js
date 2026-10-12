// User.js — defines the users table schema.
'use strict';

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const User = sequelize.define(
    'User',
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      fullName: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      email: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true,
        validate: { isEmail: true },
      },
      passwordHash: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      // Randomly generated 10-digit string, unique across all users.
      accountNumber: {
        type: DataTypes.STRING(10),
        allowNull: false,
        unique: true,
      },
      // null until the user sets a PIN for the first time.
      pinHash: {
        type: DataTypes.STRING,
        allowNull: true,
        defaultValue: null,
      },
      // DECIMAL(14,2) — Sequelize returns these as strings, so always treat
      // balance as a string and do math in integer cents to avoid float errors.
      balance: {
        type: DataTypes.DECIMAL(14, 2),
        allowNull: false,
        defaultValue: 0,
        validate: { min: 0 },
      },
    },
    {
      tableName: 'users',
      timestamps: true,
      // defaultScope strips sensitive hashes from every query by default.
      defaultScope: {
        attributes: { exclude: ['passwordHash', 'pinHash'] },
      },
      // "withSecrets" scope is used internally (auth, PIN checks) where
      // we need the hashes.
      scopes: {
        withSecrets: { attributes: {} },
      },
    }
  );

  // Convenience method — returns a plain object with hashes removed.
  // Useful when you already have a model instance and need a safe response.
  User.prototype.toSafeJSON = function () {
    const { passwordHash, pinHash, ...safe } = this.toJSON();
    return safe;
  };

  return User;
};
