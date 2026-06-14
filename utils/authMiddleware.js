const admin = require('firebase-admin');
const User = require('../models/User');

exports.verifyToken = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ success: false, message: 'No token provided, authorization denied' });
        }

        const token = authHeader.split(' ')[1];

        // Ensure Firebase Admin is initialized
        if (!admin.apps.length) {
            admin.initializeApp({
                credential: admin.credential.cert({
                    projectId: process.env.FIREBASE_PROJECT_ID,
                    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
                    privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n')
                })
            });
        }

        const decodedToken = await admin.auth().verifyIdToken(token);
        
        // Find corresponding user in our MongoDB
        // Since login/register sets the firebase uid in our MongoDB as 'uid' or by email
        // We can query by the decoded email
        const user = await User.findOne({ email: decodedToken.email });
        if (!user) {
             return res.status(404).json({ success: false, message: 'User not found in local database' });
        }

        req.user = {
            firebaseUid: decodedToken.uid,
            email: decodedToken.email,
            userId: user._id // The Mongoose ObjectId needed for Purchase schema
        };
        
        next();

    } catch (error) {
        console.error('Verify Token Error:', error);
        res.status(401).json({ success: false, message: 'Token is invalid or expired', error: error.message });
    }
};
