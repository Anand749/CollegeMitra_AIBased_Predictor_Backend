const express = require('express');
const router = express.Router();
const paymentController = require('../controllers/paymentController');
const { verifyToken } = require('../utils/authMiddleware');

// Order creation and verification (Protected)
router.post('/create-order', verifyToken, paymentController.createOrder);
router.post('/verify', verifyToken, paymentController.verifyPayment);

// Webhook — must use raw body (Buffer) so the HMAC can be computed
// against the exact bytes Razorpay signed. express.json() would parse
// and re-serialise the body, potentially changing key order/whitespace.
router.post('/webhook', express.raw({ type: 'application/json' }), paymentController.webhook);

// Dashboard purchases (Protected)
router.get('/my-purchases', verifyToken, paymentController.getMyPurchases);

module.exports = router;
