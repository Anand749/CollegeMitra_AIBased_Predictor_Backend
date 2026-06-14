const mongoose = require('mongoose');

// Read-only schema mapping to the existing 'resources' collection
// Strict is set to false so Mongoose doesn't strip out fields defined in the admin DB
const resourceSchema = new mongoose.Schema({
    name: String,
    price: Number,
    isPremium: String,
    fileUrl: String,
    // Add other minimal fields as needed, though strict: false allows accessing them anyway
}, { strict: false, collection: 'resources' });

module.exports = mongoose.model('Resource', resourceSchema);
