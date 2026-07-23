module.exports = {
    test: {
        environment: 'node',
        globals: true,
        setupFiles: ['./tests/setup.js'],
        coverage: {
            provider: 'v8',
            include: ['app.js', 'routes/**/*.js', 'middleware/**/*.js'],
            thresholds: { lines: 60 },
        },
    },
};
