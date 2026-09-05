const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const authController = require('../controllers/auth.controller');

// Strict rate limiter for login and registration (brute-force protection)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 10, // Max 10 attempts per IP per 15 minutes
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: {
    error: 'Too many authentication attempts from this IP. Please try again after 15 minutes.',
  },
});

// Moderate rate limiter for Google OAuth token verification
const googleAuthLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 20, // Max 20 attempts per IP per 15 minutes
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: {
    error: 'Too many Google sign-in attempts. Please try again after 15 minutes.',
  },
});

// Rate limiter for password reset (stricter to prevent abuse)
const resetLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: {
    error: 'Too many password reset attempts. Please try again after 15 minutes.',
  },
});

router.post('/register', authLimiter, authController.register);
router.post('/login', authLimiter, authController.login);
router.post('/google', googleAuthLimiter, authController.googleAuth);
router.post('/forgot-password', resetLimiter, authController.forgotPassword);
router.post('/reset-password', resetLimiter, authController.resetPassword);

module.exports = router;
