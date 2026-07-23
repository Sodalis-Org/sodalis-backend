const { Schema, model } = require('mongoose');

const complaintSchema = new Schema(
    {
        coloc_id: { type: String, required: true, index: true },
        creator_id: { type: String, required: true },
        target_id: { type: String },
        message: { type: String, required: true },
        is_anonymous: { type: Boolean, default: false },
        status: { type: String, enum: ['OPEN', 'RESOLVED'], default: 'OPEN' },
    },
    { timestamps: true },
);

module.exports = model('Complaint', complaintSchema);
