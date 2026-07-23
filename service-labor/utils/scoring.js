function computeHarmonyPoints(dueAt, now = new Date()) {
    const is_on_time = dueAt ? now <= new Date(dueAt) : false;
    return { is_on_time, points: is_on_time ? 10 : 2 };
}

module.exports = { computeHarmonyPoints };
