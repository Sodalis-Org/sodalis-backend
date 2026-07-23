const { Schema, model } = require('mongoose');

const pollSchema = new Schema(
    {
        coloc_id: { type: String, required: true, index: true },
        creator_id: { type: String, required: true },
        question: { type: String, required: true },
        options: [
            {
                option_id: { type: String, required: true },
                text: { type: String, required: true },
                voters: [String],
            },
        ],
        status: { type: String, enum: ['OPEN', 'CLOSED'], default: 'OPEN' },
    },
    { timestamps: true },
);

module.exports = model('Poll', pollSchema);
