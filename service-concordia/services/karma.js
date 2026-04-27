const KarmaProfile = require('../models/KarmaProfile');

async function incrementKarma(userId, colocId, points, io) {
    const profile = await KarmaProfile.findOneAndUpdate(
        { user_id: String(userId), coloc_id: String(colocId) },
        { $inc: { score: points } },
        { upsert: true, new: true },
    );

    io.emit('KARMA_UPDATED', { user_id: profile.user_id, new_score: profile.score });

    return profile;
}

module.exports = incrementKarma;
