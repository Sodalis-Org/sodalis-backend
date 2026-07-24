const { Schema, model } = require('mongoose');

const thankLogSchema = new Schema(
    {
        from_id: { type: String, required: true },
        to_id: { type: String, required: true },
        coloc_id: { type: String, required: true },
    },
    { timestamps: true },
);

thankLogSchema.index({ from_id: 1, to_id: 1, coloc_id: 1, createdAt: -1 });

module.exports = model('ThankLog', thankLogSchema);
