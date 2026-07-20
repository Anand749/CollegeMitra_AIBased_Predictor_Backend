const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const { sendOtp, registerUser, loginUser, sendResetOtp, resetPassword } = require('../controllers/userAuthController');

// Rate Limiter: 3 requests per IP every 15 minutes
const otpLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 3, // Limit each IP to 3 requests per `window`
    message: { success: false, message: 'Too many OTP requests from this IP' },
    standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
    legacyHeaders: false, // Disable the `X-RateLimit-*` headers
});

// POST /api/auth/send-otp
router.post('/send-otp', otpLimiter, sendOtp);

// POST /api/auth/register
router.post('/register', registerUser);

// POST /api/auth/login
router.post('/login', loginUser);

// POST /api/auth/forgot-password/send-otp
router.post('/forgot-password/send-otp', otpLimiter, sendResetOtp);

// POST /api/auth/forgot-password/reset
router.post('/forgot-password/reset', resetPassword);

module.exports = router;
