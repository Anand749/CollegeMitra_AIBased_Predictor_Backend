const express = require('express');
const router = express.Router();
const paymentController = require('../controllers/paymentController');
const { verifyToken } = require('../utils/authMiddleware');

// Order creation and verification (Protected)
router.post('/create-order', verifyToken, paymentController.createOrder);
router.post('/verify', verifyToken, paymentController.verifyPayment);

// Webhook (Public, secured by signature)
router.post('/webhook', express.json({ type: 'application/json' }), paymentController.webhook);

// Dashboard purchases (Protected)
router.get('/my-purchases', verifyToken, paymentController.getMyPurchases);

module.exports = router;
