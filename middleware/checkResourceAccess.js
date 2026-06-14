const Resource = require('../models/Resource');
const User = require('../models/User');

exports.checkResourceAccess = async (req, res, next) => {
    try {
        const resourceId = req.params.id; // Assume route is /api/.../:id
        const resource = await Resource.findById(resourceId);

        if (!resource) {
            return res.status(404).json({ success: false, message: 'Resource not found' });
        }

        // Allow if not premium
        if (resource.isPremium !== 'yes') {
            req.resource = resource;
            return next();
        }

        // If premium, ensure user is authenticated and has purchased it
        const userId = req.user?.userId;
        if (!userId) {
            return res.status(401).json({ success: false, message: 'Authentication required for premium resources' });
        }

        const user = await User.findById(userId);
        if (user && user.purchasedResources.some(
            (id) => id.toString() === resourceId.toString()
        )) {
            // Paid access granted
            req.resource = resource;
            return next();
        }

        // Access denied
        return res.status(403).json({ success: false, message: 'Purchase required to access this premium resource' });
    } catch (error) {
        console.error('Check Access Error:', error);
        res.status(500).json({ success: false, message: 'Failed to verify resource access' });
    }
};
