// routes/auth.js — mounts the auth controller on /api/auth
'use strict';

const { Router } = require('express');
const { register, login } = require('../controllers/authController');

const router = Router();

router.post('/register', register);
router.post('/login', login);

module.exports = router;
