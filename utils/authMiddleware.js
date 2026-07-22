const jwt = require('jsonwebtoken');
const User = require('../models/User');

exports.verifyToken = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ success: false, message: 'No token provided, authorization denied' });
        }

        const token = authHeader.split(' ')[1];

        // Verify JWT using our own secret
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        // Find corresponding user in our MongoDB
        const user = await User.findById(decoded.userId);
        if (!user) {
             return res.status(404).json({ success: false, message: 'User not found in database' });
        }

        req.user = {
            userId: user._id,
            email: user.email
        };
        
        next();

    } catch (error) {
        console.error('Verify Token Error:', error.message);
        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({ success: false, message: 'Token has expired. Please login again.' });
        }
        if (error.name === 'JsonWebTokenError') {
            return res.status(401).json({ success: false, message: 'Invalid token.' });
        }
        res.status(401).json({ success: false, message: 'Token is invalid or expired', error: error.message });
    }
};
