const mongoose = require('mongoose');

// Curseur "lu jusqu'à" par utilisateur — pas de suivi par notification individuelle,
// juste un horodatage comme Gmail "tout marquer comme lu". Suffisant tant que l'app
// n'a pas besoin de lu/non-lu au niveau de chaque notification.
const notificationReadStateSchema = new mongoose.Schema({
    user_id: { type: String, required: true },
    coloc_id: { type: String, required: true },
    last_read_at: { type: Date, required: true, default: () => new Date(0) },
});

notificationReadStateSchema.index({ user_id: 1, coloc_id: 1 }, { unique: true });

module.exports = mongoose.model('NotificationReadState', notificationReadStateSchema);
