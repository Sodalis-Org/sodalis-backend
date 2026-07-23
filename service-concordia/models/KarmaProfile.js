const mongoose = require('mongoose');

const karmaProfileSchema = new mongoose.Schema(
    {
        user_id: { type: String, required: true },
        coloc_id: { type: String, required: true },
        score: { type: Number, default: 0 },
    },
    { timestamps: true },
);

karmaProfileSchema.index({ user_id: 1, coloc_id: 1 }, { unique: true });

module.exports = mongoose.model('KarmaProfile', karmaProfileSchema);
