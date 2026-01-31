import { ApifyApiError } from 'apify-client';
import { RunSource } from 'src/entities/run-source.js';
import type { InsufficientMemoryError } from 'src/errors.js';
import { describe, expect, it, vi } from 'vitest';

vi.mock('apify-client', () => {
    class MockApifyApiError extends Error {
        readonly type: string;

        constructor(type: string) {
            super('Mock ApifyApiError');
            this.type = type;
        }
    }

    return {
        ApifyApiError: MockApifyApiError,
    };
});

describe('RunSource', () => {
    const runSource = new RunSource(
        async () => {
            throw new Error('Not implemented for this test');
        },
        async () => 2048,
    );

    describe('parseRunStartError', () => {
        it('returns the original error if it is not a known start run error', async () => {
            const originalError = new Error('Some other error');
            const parsedError = await runSource.parseRunStartError(originalError, 'test-run');
            expect(parsedError).toBe(originalError);
        });

        it('correctly parses memory limit exceeded errors', async () => {
            // @ts-expect-error Constructing mock ApifyApiError
            const memoryError = new ApifyApiError('actor-memory-limit-exceeded');
            const parsedError = await runSource.parseRunStartError(memoryError, 'test-run', { memory: 4096 });
            expect(parsedError).toHaveProperty('name', 'InsufficientMemoryError');
            expect(parsedError).toHaveProperty('message');
            expect((parsedError as InsufficientMemoryError).requiredMemoryMBs).toBe(4096);
        });

        it('correctly parses concurrent runs limit exceeded errors', async () => {
            // @ts-expect-error Constructing mock ApifyApiError
            const concurrentRunsError = new ApifyApiError('concurrent-runs-limit-exceeded');
            const parsedError = await runSource.parseRunStartError(concurrentRunsError, 'test-run');
            expect(parsedError).toHaveProperty('name', 'InsufficientActorJobsError');
            expect(parsedError).toHaveProperty('message');
        });
    });
});
