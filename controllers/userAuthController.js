const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Otp = require('../models/Otp');
const { sendOtpEmail } = require('../utils/emailService');

/**
 * Helper: Generate a signed JWT token
 */
const generateToken = (user) => {
    return jwt.sign(
        { userId: user._id, email: user.email },
        process.env.JWT_SECRET,
        { expiresIn: '7d' }
    );
};

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

        // Hash password with bcrypt
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        // Create user in MongoDB with hashed password
        const user = await User.create({
            email,
            password: hashedPassword,
            username: username.trim(),
            phone: phone.trim()
        });

        // Generate JWT token for auto-login
        const token = generateToken(user);

        console.log(`✅ New user registered: ${user.username} (${user.email})`);

        res.status(201).json({
            success: true,
            message: 'Registration successful',
            data: {
                _id: user._id,
                email: user.email,
                username: user.username,
                phone: user.phone,
                createdAt: user.createdAt,
                updatedAt: user.updatedAt
            },
            token
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
 * @body    { email: string, password: string }
 */
exports.loginUser = async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ success: false, message: 'Email and password are required' });
        }

        // Find user by email
        const user = await User.findOne({ email });
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'Account not found. Please register first.'
            });
        }

        // Check if user has a password (legacy Firebase users won't)
        if (!user.password) {
            console.log(`⚠️ Legacy user login detected: ${email}. Verifying with Firebase REST API...`);
            
            // Verify password against Firebase REST API
            const firebaseVerifyResponse = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${process.env.FIREBASE_WEB_API_KEY}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password, returnSecureToken: true })
            });

            const firebaseData = await firebaseVerifyResponse.json();

            if (!firebaseVerifyResponse.ok) {
                console.error('Firebase verification failed:', firebaseData.error?.message);
                return res.status(400).json({
                    success: false,
                    message: 'Invalid email or password.'
                });
            }

            // Firebase verified the password! Now we migrate them to bcrypt
            const salt = await bcrypt.genSalt(10);
            user.password = await bcrypt.hash(password, salt);
            console.log(`✅ Legacy user ${email} successfully migrated to bcrypt!`);
        } else {
            // Standard bcrypt verification for migrated/new users
            const isMatch = await bcrypt.compare(password, user.password);
            if (!isMatch) {
                return res.status(400).json({
                    success: false,
                    message: 'Invalid email or password.'
                });
            }
        }

        // Update last login timestamp
        user.updatedAt = Date.now();
        await user.save();

        // Generate JWT token
        const token = generateToken(user);

        console.log(`✅ User logged in: ${user.username} (${user.email})`);

        res.status(200).json({
            success: true,
            message: 'Login successful',
            data: {
                _id: user._id,
                email: user.email,
                username: user.username,
                phone: user.phone,
                createdAt: user.createdAt,
                updatedAt: user.updatedAt
            },
            token
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

        // Find user and update password in MongoDB
        const user = await User.findOne({ email });
        if (!user) {
             return res.status(404).json({ success: false, message: 'Account not found' });
        }

        // Hash the new password
        const salt = await bcrypt.genSalt(10);
        user.password = await bcrypt.hash(newPassword, salt);
        await user.save();

        // Generate token for auto-login after reset
        const token = generateToken(user);

        console.log(`✅ Password reset successful for: ${email}`);

        res.status(200).json({
            success: true,
            message: 'Password has been reset successfully. You can now login.',
            data: {
                _id: user._id,
                email: user.email,
                username: user.username,
                phone: user.phone,
                createdAt: user.createdAt,
                updatedAt: user.updatedAt
            },
            token
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
