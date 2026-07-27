const dotenv = require('dotenv');
// Load environment variables FIRST (before any module that reads process.env)
dotenv.config();

const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const connectDB = require('./config/db');
const userAuthRoutes = require('./routes/userAuthRoutes');
const paymentRoutes = require('./routes/paymentRoutes');
const resourceRoutes = require('./routes/resourceRoutes');

// Connect to MongoDB
connectDB();

const app = express();

// ── Global Rate Limiter ──
// 100 requests per 15 minutes per IP across all API routes
const globalLimiter = rateLimit({
    windowMs: 10 * 60 * 1000,
    max: 100,
    message: { success: false, message: 'Too many requests from this IP, please try again after 10 minutes' },
    standardHeaders: true,
    legacyHeaders: false,
});

// ── Stricter Payment Rate Limiter ──
// 10 requests per 15 minutes per IP for payment routes
const paymentLimiter = rateLimit({
    windowMs: 10 * 60 * 1000,
    max: 20,
    message: { success: false, message: 'Too many payment requests. Please try again after 10 minutes.' },
    standardHeaders: true,
    legacyHeaders: false,
});

// Middleware
app.use(cors({
    origin: ['http://localhost:5173', 'http://localhost:5174', process.env.FRONTEND_URL, 'https://techzdada.in', 'https://www.techzdada.in'].filter(Boolean),
    credentials: true
}));
app.use(express.json());

// Apply global rate limiter to all /api routes
app.use('/api', globalLimiter);

// Routes
app.use('/api/auth', userAuthRoutes);
app.use('/api/payment', paymentLimiter, paymentRoutes);
app.use('/api/resource', resourceRoutes);

// Health check
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', message: 'CPC User Backend is running' });
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Server Error:', err.message);
    res.status(500).json({
        success: false,
        message: 'Internal server error',
        error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
});

const PORT = process.env.PORT || 5000;

// Only listen locally, Vercel will handle requests via the exported app
if (process.env.NODE_ENV !== 'production') {
    app.listen(PORT, () => {
        console.log(`🚀 CPC User Backend running on port ${PORT}`);
    });
}

// Export for Vercel Serverless
module.exports = app;
