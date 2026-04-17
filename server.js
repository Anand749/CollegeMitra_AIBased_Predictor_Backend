const dotenv = require('dotenv');
// Load environment variables FIRST (before any module that reads process.env)
dotenv.config();

const express = require('express');
const cors = require('cors');
const connectDB = require('./config/db');
const userAuthRoutes = require('./routes/userAuthRoutes');

// Connect to MongoDB
connectDB();

const app = express();

// Middleware
app.use(cors({
    origin: ['http://localhost:5173', 'http://localhost:5174', process.env.FRONTEND_URL, 'https://techzdada.in', 'https://www.techzdada.in'].filter(Boolean),
    credentials: true
}));
app.use(express.json());

// Routes
app.use('/api/auth', userAuthRoutes);

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
