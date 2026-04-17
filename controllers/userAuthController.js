const admin = require('firebase-admin');
const User = require('../models/User');
const Otp = require('../models/Otp');
const { sendOtpEmail } = require('../utils/emailService');

// Initialize Firebase Admin SDK
if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert({
            projectId: process.env.FIREBASE_PROJECT_ID,
            clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
            privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n')
        })
    });
}

/**
 * Generate 6-digit OTP
 */
const generateOTP = () => {
    return Math.floor(100000 + Math.random() * 900000).toString();
};

/**
 * @desc    Send OTP to email for registration
 * @route   POST /api/auth/send-otp
 * @body    { email: string }
 */
exports.sendOtp = async (req, res) => {
    try {
        const { email } = req.body;

        if (!email) {
            return res.status(400).json({ success: false, message: 'Email is required' });
        }

        // Check if user already exists in MongoDB
        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(400).json({ success: false, message: 'Email already registered. Please login.' });
        }

        // Delete any existing OTPs for this email
        await Otp.deleteMany({ email });

        // Generate and save OTP
        const otp = generateOTP();
        await Otp.create({ email, otp });

        // Send email
        await sendOtpEmail(email, otp);

        console.log(`📧 OTP sent to: ${email}`);

        res.status(200).json({
            success: true,
            message: 'OTP sent to your email'
        });

    } catch (error) {
        console.error('Send OTP error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to send OTP. Please try again.',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

/**
 * @desc    Verify OTP and Register user
 * @route   POST /api/auth/register
 * @body    { email, password, username, phone, otp }
 */
exports.registerUser = async (req, res) => {
    try {
        const { email, password, username, phone, otp } = req.body;

        // Validate all fields
        if (!email || !password || !username || !phone || !otp) {
            return res.status(400).json({ success: false, message: 'All fields are required' });
        }
        if (username.trim().length < 2) {
            return res.status(400).json({ success: false, message: 'Name must be at least 2 characters' });
        }
        if (phone.trim().length < 10) {
            return res.status(400).json({ success: false, message: 'Valid mobile number is required' });
        }
        if (password.length < 6) {
            return res.status(400).json({ success: false, message: 'Password must be at least 6 characters' });
        }

        // Verify OTP
        const otpRecord = await Otp.findOne({ email, otp });
        if (!otpRecord) {
            return res.status(400).json({ success: false, message: 'Invalid or expired OTP' });
        }

        // OTP is valid — delete it
        await Otp.deleteMany({ email });

        // Check if user already exists
        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(400).json({ success: false, message: 'Email already registered. Please login.' });
        }

        // Create Firebase user via Admin SDK
        let firebaseUser;
        try {
            firebaseUser = await admin.auth().createUser({
                email,
                password,
                displayName: username.trim(),
                emailVerified: true // Already verified via OTP
            });
        } catch (firebaseError) {
            if (firebaseError.code === 'auth/email-already-exists') {
                return res.status(400).json({ success: false, message: 'Email already registered in Firebase. Please login.' });
            }
            throw firebaseError;
        }

        // Create user in MongoDB
        const user = await User.create({
            uid: firebaseUser.uid,
            email,
            username: username.trim(),
            phone: phone.trim()
        });

        // Generate custom token for auto-login
        const customToken = await admin.auth().createCustomToken(firebaseUser.uid);

        console.log(`✅ New user registered: ${user.username} (${user.email})`);

        res.status(201).json({
            success: true,
            message: 'Registration successful',
            data: {
                uid: user.uid,
                email: user.email,
                username: user.username,
                phone: user.phone,
                createdAt: user.createdAt,
                updatedAt: user.updatedAt
            },
            customToken
        });

    } catch (error) {
        console.error('Register error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error during registration',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

/**
 * @desc    Login existing user
 * @route   POST /api/auth/login
 * @body    { idToken: string }
 */
exports.loginUser = async (req, res) => {
    try {
        const { idToken } = req.body;

        if (!idToken) {
            return res.status(400).json({ success: false, message: 'Firebase ID token is required' });
        }

        // Verify Firebase ID token
        let decodedToken;
        try {
            decodedToken = await admin.auth().verifyIdToken(idToken);
        } catch (firebaseError) {
            console.error('Firebase token verification failed:', firebaseError.message);
            return res.status(401).json({ success: false, message: 'Invalid or expired token' });
        }

        const { uid } = decodedToken;

        // Find user in database
        const user = await User.findOneAndUpdate(
            { uid },
            { updatedAt: Date.now() },
            { new: true }
        );

        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'Account not found. Please register first.'
            });
        }

        console.log(`✅ User logged in: ${user.username} (${user.email})`);

        res.status(200).json({
            success: true,
            message: 'Login successful',
            data: {
                uid: user.uid,
                email: user.email,
                username: user.username,
                phone: user.phone,
                createdAt: user.createdAt,
                updatedAt: user.updatedAt
            }
        });

    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error during login',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

/**
 * @desc    Send OTP to email for password reset
 * @route   POST /api/auth/forgot-password/send-otp
 * @body    { email: string }
 */
exports.sendResetOtp = async (req, res) => {
    try {
        const { email } = req.body;

        if (!email) {
            return res.status(400).json({ success: false, message: 'Email is required' });
        }

        // Check if user exists in MongoDB
        const existingUser = await User.findOne({ email });
        if (!existingUser) {
            return res.status(404).json({ success: false, message: 'No account found with this email' });
        }

        // Delete any existing OTPs for this email
        await Otp.deleteMany({ email });

        // Generate and save OTP
        const otp = generateOTP();
        await Otp.create({ email, otp });

        // Send reset email
        const { sendResetOtpEmail } = require('../utils/emailService');
        await sendResetOtpEmail(email, otp);

        console.log(`📧 Reset OTP sent to: ${email}`);

        res.status(200).json({
            success: true,
            message: 'Password reset OTP sent to your email'
        });

    } catch (error) {
        console.error('Send Reset OTP error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to send reset OTP. Please try again.',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

/**
 * @desc    Verify OTP and change password
 * @route   POST /api/auth/forgot-password/reset
 * @body    { email, newPassword, otp }
 */
exports.resetPassword = async (req, res) => {
    try {
        const { email, newPassword, otp } = req.body;

        if (!email || !newPassword || !otp) {
            return res.status(400).json({ success: false, message: 'All fields are required' });
        }

        if (newPassword.length < 6) {
            return res.status(400).json({ success: false, message: 'Password must be at least 6 characters' });
        }

        // Verify OTP
        const otpRecord = await Otp.findOne({ email, otp });
        if (!otpRecord) {
            return res.status(400).json({ success: false, message: 'Invalid or expired OTP' });
        }

        // OTP is valid — delete it
        await Otp.deleteMany({ email });

        // Update password in Firebase
        const existingUser = await User.findOne({ email });
        if (!existingUser) {
             return res.status(404).json({ success: false, message: 'Account not found' });
        }

        await admin.auth().updateUser(existingUser.uid, {
            password: newPassword
        });

        console.log(`✅ Password reset successful for: ${email}`);

        res.status(200).json({
            success: true,
            message: 'Password has been reset successfully. You can now login.'
        });

    } catch (error) {
        console.error('Reset password error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error during password reset',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};
