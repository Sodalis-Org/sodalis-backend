module.exports = {
    test: {
        environment: 'node',
        globals: true,
        setupFiles: ['./tests/setup.js'],
        coverage: {
            provider: 'v8',
            include: ['app.js', 'resolvers.js', 'schema.js'],
            thresholds: { lines: 60 },
        },
    },
};
