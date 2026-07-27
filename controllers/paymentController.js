const Razorpay = require('razorpay');
const crypto = require('crypto');
const Resource = require('../models/Resource');
const Purchase = require('../models/Purchase');
const User = require('../models/User');
const { sendPurchaseEmail } = require('../utils/emailService');

const razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID || 'dummy_key',
    key_secret: process.env.RAZORPAY_KEY_SECRET || 'dummy_secret'
});

exports.createOrder = async (req, res) => {
    try {
        const { resourceId } = req.body;
        const userId = req.user.userId; // Provided by authMiddleware

        if (!resourceId) {
            return res.status(400).json({ success: false, message: 'Resource ID is required' });
        }

        const resource = await Resource.findById(resourceId);

        if (!resource) {
            return res.status(404).json({ success: false, message: 'Resource not found' });
        }

        if (resource.isPremium !== 'yes') {
            return res.status(400).json({ success: false, message: 'This resource is free' });
        }

        // Check if user already purchased it
        const user = await User.findById(userId);
        const hasInArray = user.purchasedResources.some(
            (id) => id.toString() === resourceId.toString()
        );

        if (hasInArray) {
            // Cross-check: does a successful Purchase record actually exist?
            const existingPurchase = await Purchase.findOne({
                userId,
                resourceId,
                status: 'success'
            });

            if (existingPurchase) {
                return res.status(400).json({ success: false, message: 'You have already purchased this resource' });
            }

            // Auto-repair: Purchase record was deleted but resourceId lingered in user array.
            // Remove the stale entry so the user can re-purchase.
            console.warn(`⚠️ Auto-repairing stale purchasedResources for user ${userId}, resource ${resourceId}`);
            await User.findByIdAndUpdate(userId, {
                $pull: { purchasedResources: resourceId }
            });
        }

        const baseAmount = Number(resource.price) || 0;
        const serviceFee = Math.round(baseAmount * 0.02 * 100) / 100; // 2% of price, rounded to 2 decimal places
        const totalAmount = Math.round((baseAmount + serviceFee) * 100) / 100;

        // Create Razorpay Order
        const options = {
            amount: Math.round(totalAmount * 100), // in paise, strictly integer
            currency: 'INR',
            receipt: `rcpt_${userId.toString().slice(-4)}_${Date.now()}`
        };

        const order = await razorpay.orders.create(options);

        // Store initial purchase log
        const purchase = new Purchase({
            userId,
            resourceId,
            orderId: order.id,
            baseAmount,
            serviceFee,
            totalAmount,
            status: 'created'
        });
        await purchase.save();

        res.status(200).json({
            success: true,
            order_id: order.id,
            amount: order.amount,
            currency: order.currency,
            totalAmount,
            baseAmount,
            serviceFee
        });

    } catch (error) {
        console.error('Create Order Error:', error);
        res.status(500).json({ success: false, message: 'Failed to create order', error: error.message });
    }
};

exports.verifyPayment = async (req, res) => {
    try {
        const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
        const userId = req.user.userId;

        // Verify HMAC SHA256 Signature
        const sign = razorpay_order_id + "|" + razorpay_payment_id;
        const expectedSign = crypto
            .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
            .update(sign.toString())
            .digest("hex");

        if (razorpay_signature !== expectedSign) {
            // Invalid signature — mark purchase as failed
            const purchase = await Purchase.findOne({ orderId: razorpay_order_id });
            if (purchase) {
                purchase.status = 'failed';
                await purchase.save();
            }
            return res.status(400).json({ success: false, message: 'Invalid payment signature' });
        }

        // ── Signature is valid ──
        const purchase = await Purchase.findOne({ orderId: razorpay_order_id });

        if (!purchase) {
            return res.status(404).json({ success: false, message: 'Purchase record not found' });
        }

        if (purchase.status === 'success') {
            return res.status(200).json({ success: true, message: 'Payment already verified' });
        }

        // Atomically update purchase status (single write)
        purchase.paymentId = razorpay_payment_id;
        purchase.status = 'success';

        // Run all remaining DB operations in parallel to stay well within
        // Vercel's 10-second free-plan timeout
        const [, user, resource] = await Promise.all([
            purchase.save(),
            User.findByIdAndUpdate(userId, {
                $addToSet: { purchasedResources: purchase.resourceId }
            }, { new: true }),
            Resource.findById(purchase.resourceId)
        ]);

        // Send receipt email silently in the background (never blocks the response)
        sendPurchaseEmail(user.email, resource.name, purchase.totalAmount, purchase.paymentId).catch(err => {
            console.error("Failed to send purchase email:", err);
        });

        return res.status(200).json({ success: true, message: 'Payment verified successfully' });

    } catch (error) {
        console.error('Verify Payment Error:', error);
        res.status(500).json({ success: false, message: 'Payment verification failed', error: error.message });
    }
};


exports.webhook = async (req, res) => {
    try {
        const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
        const signature = req.headers['x-razorpay-signature'];

        // req.body is a raw Buffer here (express.raw middleware is applied on this route).
        // Razorpay signs the raw bytes of the payload, so we must pass the Buffer directly
        // to createHmac — NOT JSON.stringify(req.body), which can produce a different byte
        // sequence than what Razorpay signed.
        const expectedSignature = crypto.createHmac('sha256', secret)
            .update(req.body)                   // raw Buffer — exact bytes Razorpay signed
            .digest('hex');

        if (expectedSignature !== signature) {
            console.warn('⚠️ Webhook: invalid signature received');
            return res.status(400).send('Invalid signature');
        }

        // Signature is valid — parse body now
        const parsedBody = JSON.parse(req.body.toString());

        if (parsedBody.event === 'payment.captured') {
            const payment = parsedBody.payload.payment.entity;
            const orderId = payment.order_id;

            // Fetch purchase by orderId
            const purchase = await Purchase.findOne({ orderId });

            if (purchase && purchase.status !== 'success') {
                // Run all writes in parallel to reduce execution time
                const [, user, resource] = await Promise.all([
                    Purchase.findOneAndUpdate(
                        { orderId, status: { $ne: 'success' } },
                        { status: 'success', paymentId: payment.id },
                        { new: true }
                    ),
                    User.findByIdAndUpdate(purchase.userId, {
                        $addToSet: { purchasedResources: purchase.resourceId }
                    }, { new: true }),
                    Resource.findById(purchase.resourceId)
                ]);

                if (user && resource) {
                    sendPurchaseEmail(user.email, resource.name, purchase.totalAmount, payment.id).catch(err => {
                        console.error('Failed to send purchase email via webhook:', err);
                    });
                }
            }
        }

        res.status(200).send('Webhook verified');
    } catch (error) {
        console.error('Webhook Error:', error);
        res.status(500).send('Webhook failed');
    }
};


exports.getMyPurchases = async (req, res) => {
    try {
        const userId = req.user.userId;
        const purchases = await Purchase.find({ userId, status: 'success' })
            .populate('resourceId', 'name isPremium')
            .sort({ createdAt: -1 });

        res.status(200).json({ success: true, purchases });
    } catch (error) {
        console.error('Get Purchases Error:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch purchases' });
    }
};
