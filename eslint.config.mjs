import prettier from 'eslint-config-prettier';

import apify from '@apify/eslint-config/ts.js';
import globals from 'globals';
import tsEslint from 'typescript-eslint';

// eslint-disable-next-line import/no-default-export
export default [
    { ignores: ['**/dist', '**/coverage', 'eslint.config.mjs', 'vitest.config.ts'] },
    ...apify,
    prettier,
    {
        languageOptions: {
            parser: tsEslint.parser,
            parserOptions: {
                project: 'tsconfig.eslint.json',
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
            'no-console': 0,
            'max-classes-per-file': ['error', { max: 10 }],
        },
    },
];
