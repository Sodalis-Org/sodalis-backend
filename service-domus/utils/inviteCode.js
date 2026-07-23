const crypto = require('crypto');

function generateInviteCode(name) {
    const normalized = name
        .toLowerCase()
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/[^a-z0-9]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '')
        .substring(0, 15);

    const suffix = crypto.randomBytes(2).toString('hex');
    return `${normalized || 'coloc'}-${suffix}`;
}

module.exports = { generateInviteCode };
