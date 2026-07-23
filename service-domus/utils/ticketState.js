const STATUS_TRANSITIONS = {
    OPEN: ['IN_PROGRESS', 'CANCELLED'],
    IN_PROGRESS: ['RESOLVED', 'CANCELLED'],
    RESOLVED: [],
    CANCELLED: [],
};

function canTransition(from, to) {
    if (from === to) return true;
    return (STATUS_TRANSITIONS[from] || []).includes(to);
}

module.exports = { STATUS_TRANSITIONS, canTransition };
