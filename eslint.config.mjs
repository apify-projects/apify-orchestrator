import prettier from 'eslint-config-prettier';

import apify from '@apify/eslint-config/ts.js';
import globals from 'globals';
import tsEslint from 'typescript-eslint';

// eslint-disable-next-line import/no-default-export
export default [
    {
        ignores: [
            '**/dist',
            '**/coverage',
            'eslint.config.mjs',
            'vitest.config.ts',
            'e2e-test.js',
            'apify-orchestrator-e2e-test*',
        ],
    },
    ...apify,
    prettier,
    {
        languageOptions: {
            parser: tsEslint.parser,
            parserOptions: {
                project: 'tsconfig.json',
            },
            globals: {
                ...globals.node,
                ...globals.jest,
            },
        },
        plugins: {
            '@typescript-eslint': tsEslint.plugin,
        },
        rules: {
            'max-classes-per-file': 0,
        },
    },
    {
        files: ['**/*.test.ts', '**/__test-helpers__/**'],
        rules: {
            'import/no-extraneous-dependencies': ['error', { devDependencies: true }],
        },
    },
];
