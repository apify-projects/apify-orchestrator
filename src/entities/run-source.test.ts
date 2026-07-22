import type { ActorRun } from 'apify-client';
import { ApifyApiError } from 'apify-client';
import type { AxiosResponse } from 'axios';
import { describe, expect, it, vi } from 'vitest';

import type { InsufficientMemoryError } from '../errors.js';
import { RunSource } from './run-source.js';

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
    const runSource = new RunSource({
        type: 'actor',
        start: async () => {
            throw new Error('Not implemented for this test');
        },
        defaultMemoryMbytes: async () => 2048,
    });

    describe('getRequestId', () => {
        it('returns the runName as-is when provided, regardless of input/options', () => {
            expect(runSource.getRequestId({ a: 1 }, { memory: 1024 }, 'my-run-name')).toBe('my-run-name');
        });

        it('generates a stable, deterministic ID when runName is not provided', () => {
            const first = runSource.getRequestId({ a: 1 }, { memory: 1024 }, undefined);
            const second = runSource.getRequestId({ a: 1 }, { memory: 1024 }, undefined);
            expect(first).toEqual(second);
        });

        it('generates different IDs for different input', () => {
            const idA = runSource.getRequestId({ a: 1 }, undefined, undefined);
            const idB = runSource.getRequestId({ a: 2 }, undefined, undefined);
            expect(idA).not.toEqual(idB);
        });

        it('generates different IDs for different options', () => {
            const idA = runSource.getRequestId({ a: 1 }, { memory: 1024 }, undefined);
            const idB = runSource.getRequestId({ a: 1 }, { memory: 2048 }, undefined);
            expect(idA).not.toEqual(idB);
        });

        it('generates different IDs for different source IDs', () => {
            const notImplementedStart = async (): Promise<ActorRun> => {
                throw new Error('Not implemented for this test');
            };
            const sourceA = new RunSource({ type: 'actor', id: 'actor-a', start: notImplementedStart });
            const sourceB = new RunSource({ type: 'actor', id: 'actor-b', start: notImplementedStart });

            const idA = sourceA.getRequestId({ a: 1 }, undefined, undefined);
            const idB = sourceB.getRequestId({ a: 1 }, undefined, undefined);
            expect(idA).not.toEqual(idB);
        });

        it('generates different IDs for different source types', () => {
            const notImplementedStart = async (): Promise<ActorRun> => {
                throw new Error('Not implemented for this test');
            };
            const actorSource = new RunSource({ type: 'actor', id: 'same-id', start: notImplementedStart });
            const taskSource = new RunSource({ type: 'task', id: 'same-id', start: notImplementedStart });

            const idA = actorSource.getRequestId({ a: 1 }, undefined, undefined);
            const idB = taskSource.getRequestId({ a: 1 }, undefined, undefined);
            expect(idA).not.toEqual(idB);
        });
    });

    describe('parseRunStartError', () => {
        it('returns the original error if it is not a known start run error', async () => {
            const originalError = new Error('Some other error');
            const parsedError = await runSource.parseRunStartError(originalError, 'test-run');
            expect(parsedError).toBe(originalError);
        });

        it('correctly parses memory limit exceeded errors', async () => {
            const memoryError = new ApifyApiError('actor-memory-limit-exceeded' as unknown as AxiosResponse, 1);
            const parsedError = await runSource.parseRunStartError(memoryError, 'test-run', { memory: 4096 });
            expect(parsedError).toHaveProperty('name', 'InsufficientMemoryError');
            expect(parsedError).toHaveProperty('message');
            expect((parsedError as InsufficientMemoryError).requiredMemoryMBs).toBe(4096);
        });

        it('correctly parses concurrent runs limit exceeded errors', async () => {
            const concurrentRunsError = new ApifyApiError(
                'concurrent-runs-limit-exceeded' as unknown as AxiosResponse,
                1,
            );
            const parsedError = await runSource.parseRunStartError(concurrentRunsError, 'test-run');
            expect(parsedError).toHaveProperty('name', 'InsufficientActorJobsError');
            expect(parsedError).toHaveProperty('message');
        });
    });
});
