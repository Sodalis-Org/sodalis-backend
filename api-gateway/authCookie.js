const isProduction = process.env.NODE_ENV === 'production';

const AUTH_COOKIE_NAME = 'sodalis_token';

// sameSite: 'strict' fonctionne ici car frontend et gateway partagent le même
// domaine registrable (localhost en dev, hôte Docker unique en prod) — seul le port diffère.
const AUTH_COOKIE_OPTIONS = {
    httpOnly: true,
    sameSite: 'strict',
    secure: isProduction,
};

module.exports = { AUTH_COOKIE_NAME, AUTH_COOKIE_OPTIONS };
