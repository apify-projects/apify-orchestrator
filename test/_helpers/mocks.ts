import type { ActorRun } from 'apify-client';
import type { Storage } from 'src/utils/storage.js';
import { vi } from 'vitest';

export function getMockRun({
    id = 'test-run-id',
    status = 'READY',
    startedAt = new Date(),
    defaultDatasetId = 'test-dataset-id',
} = {}): ActorRun {
    return { id, status, startedAt, defaultDatasetId } as ActorRun;
}

export const storageMock = { useState: vi.fn() } as Storage;
