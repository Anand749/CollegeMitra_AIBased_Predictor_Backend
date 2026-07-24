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

        if (razorpay_signature === expectedSign) {
            // Signature is valid, update purchase status
            const purchase = await Purchase.findOne({ orderId: razorpay_order_id });

            if (!purchase) {
                return res.status(404).json({ success: false, message: 'Purchase record not found' });
            }

            if (purchase.status === 'success') {
                return res.status(200).json({ success: true, message: 'Payment already verified' });
            }

            purchase.paymentId = razorpay_payment_id;
            purchase.status = 'success';
            await purchase.save();

            // Grant access to user
            const user = await User.findByIdAndUpdate(userId, {
                $addToSet: { purchasedResources: purchase.resourceId }
            }, { new: true });

            // Fetch the resource name to send in email
            const resource = await Resource.findById(purchase.resourceId);
            
            // Send the wonderful receipt email silently in the background
            sendPurchaseEmail(user.email, resource.name, purchase.totalAmount, purchase.paymentId).catch(err => {
                console.error("Failed to send purchase email:", err);
            });

            return res.status(200).json({ success: true, message: 'Payment verified successfully' });
        } else {
            // Invalid signature
            const purchase = await Purchase.findOne({ orderId: razorpay_order_id });
            if (purchase) {
                purchase.status = 'failed';
                await purchase.save();
            }
            return res.status(400).json({ success: false, message: 'Invalid payment signature' });
        }
    } catch (error) {
        console.error('Verify Payment Error:', error);
        res.status(500).json({ success: false, message: 'Payment verification failed', error: error.message });
    }
};

exports.webhook = async (req, res) => {
    try {
        const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
        const signature = req.headers['x-razorpay-signature'];

        // Use raw body for webhook verification if Express is parsing it differently, but for standard stringified:
        const expectedSignature = crypto.createHmac('sha256', secret)
            .update(JSON.stringify(req.body))
            .digest('hex');

        if (expectedSignature === signature) {
            // Check event type
            if (req.body.event === 'payment.captured') {
                const payment = req.body.payload.payment.entity;
                const orderId = payment.order_id;

                // Fetch purchase by orderId
                const purchase = await Purchase.findOne({ orderId });

                if (purchase && purchase.status !== 'success') {
                    purchase.status = 'success';
                    purchase.paymentId = payment.id;
                    await purchase.save();

                    // Grant access
                    const user = await User.findByIdAndUpdate(purchase.userId, {
                        $addToSet: { purchasedResources: purchase.resourceId }
                    }, { new: true });
                    
                    const resource = await Resource.findById(purchase.resourceId);
                    
                    sendPurchaseEmail(user.email, resource.name, purchase.totalAmount, purchase.paymentId).catch(err => {
                         console.error("Failed to send purchase email via webhook:", err);
                    });
                }
            }
            res.status(200).send('Webhook verified');
        } else {
            res.status(400).send('Invalid signature');
        }
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
