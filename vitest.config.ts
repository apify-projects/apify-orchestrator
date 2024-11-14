import tsconfigPaths from 'vite-tsconfig-paths';
import { defineConfig } from 'vitest/config';

export default defineConfig({
    plugins: [tsconfigPaths()],
    esbuild: {
        target: 'es2022',
        keepNames: true,
    },
    test: {
        globals: true,
        coverage: {
            provider: 'v8',
            reporter: ['text', 'lcov', 'cobertura'],
            exclude: [
                '**/node_modules/**',
                '**/dist/**',
                '**/test/**',
                'vitest.config.ts',
            ],
        },
        restoreMocks: true,
        testTimeout: 60_000,
        hookTimeout: 60_000,
    },
});
