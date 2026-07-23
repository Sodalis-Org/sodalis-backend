const KarmaProfile = require('../models/KarmaProfile');
const publisher = require('../redis-publisher');

async function incrementKarma(userId, colocId, points) {
    const profile = await KarmaProfile.findOneAndUpdate(
        { user_id: String(userId), coloc_id: String(colocId) },
        { $inc: { score: points } },
        { upsert: true, new: true },
    );

    await publisher.publish(
        'sodalis_events',
        JSON.stringify({
            type: 'KARMA_UPDATED',
            coloc_id: String(colocId),
            user_id: profile.user_id,
            new_score: profile.score,
            message: 'Score karma mis à jour pour un membre de la colocation',
        }),
    );

    return profile;
}

module.exports = incrementKarma;
