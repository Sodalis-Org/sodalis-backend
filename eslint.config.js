const js = require('@eslint/js');
const nodePlugin = require('eslint-plugin-n');
const prettierConfig = require('eslint-config-prettier');

module.exports = [
    {
        ignores: ['**/node_modules/**', '**/db-init/**', '**/coverage/**', 'docker-compose.yml'],
    },
    js.configs.recommended,
    nodePlugin.configs['flat/recommended-script'],
    {
        languageOptions: {
            sourceType: 'commonjs',
            ecmaVersion: 2023,
            globals: {
                process: 'readonly',
                console: 'readonly',
                __dirname: 'readonly',
                module: 'writable',
                require: 'readonly',
                Buffer: 'readonly',
                fetch: 'readonly',
            },
        },
        rules: {
            'n/no-process-exit': 'off',
            'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
        },
    },
    {
        files: ['**/*.test.js', '**/tests/**/*.js', 'scripts/**/*.js'],
        languageOptions: {
            globals: {
                describe: 'readonly',
                it: 'readonly',
                test: 'readonly',
                expect: 'readonly',
                vi: 'readonly',
                beforeEach: 'readonly',
                afterEach: 'readonly',
                beforeAll: 'readonly',
                afterAll: 'readonly',
            },
        },
        rules: {
            'n/no-unpublished-require': 'off',
        },
    },
    prettierConfig,
];
