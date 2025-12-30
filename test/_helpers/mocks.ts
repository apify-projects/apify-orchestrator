import type { ActorRun } from 'apify-client';
import type { Storage } from 'src/utils/storage.js';
import { vi } from 'vitest';

export const actorRunMock = { id: 'test-run-1', status: 'READY', startedAt: new Date() } as ActorRun;

export const storageMock = { useState: vi.fn() } as Storage;
