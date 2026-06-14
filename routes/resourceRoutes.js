const express = require('express');
const router = express.Router();
const { verifyToken } = require('../utils/authMiddleware');
const { checkResourceAccess } = require('../middleware/checkResourceAccess');

// Endpoint to securely fetch the true download URL of a resource.
router.get('/:id/download', verifyToken, checkResourceAccess, (req, res) => {
    try {
        const resource = req.resource; // Attached by middleware
        
        if (!resource.fileUrl) {
            return res.status(404).json({ success: false, message: 'Resource file URL is empty' });
        }

        // Return the fileUrl for the frontend to open/download
        res.status(200).json({ success: true, fileUrl: resource.fileUrl });
    } catch (error) {
        console.error('Resource Download Proxy Error:', error);
        res.status(500).json({ success: false, message: 'Failed to access resource file' });
    }
});

module.exports = router;
