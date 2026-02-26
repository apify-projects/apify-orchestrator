import type { ActorRun } from 'apify-client';
import type { RunSource } from 'src/entities/run-source.js';
import type { Storage } from 'src/utils/storage.js';
import { vi } from 'vitest';

export function createActorRunMock({
    id = 'test-run-id',
    status = 'READY',
    startedAt = new Date(),
    defaultDatasetId = 'test-dataset-id',
} = {}): ActorRun {
    return { id, status, startedAt, defaultDatasetId } as ActorRun;
}

export const storageMock = { useState: vi.fn() } as Storage;

export function createMockRunSource(run: ActorRun): RunSource {
    return {
        start: vi.fn().mockResolvedValue(run),
        parseRunStartError: vi.fn().mockImplementation((error) => error),
    } as unknown as RunSource;
}
