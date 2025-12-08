import { Actor } from 'apify';
import { buildRunTrackerForOrchestrator } from 'src/tracking/builder.js';
import { CurrentRunTracker } from 'src/tracking/current-run-tracker.js';
import { FailedRunHistoryTracker } from 'src/tracking/failed-run-history-tracker.js';
import { RunTracker } from 'src/tracking/run-tracker.js';
import type { GlobalContext } from 'src/utils/context.js';
import { EncryptedKeyValueStore } from 'src/utils/key-value-store.js';
import { buildLogger } from 'src/utils/logging.js';
import { buildStorage } from 'src/utils/storage.js';
import { getTestOptions } from 'test/_helpers/context.js';
import { describe, expect, it, vi } from 'vitest';

vi.mock('apify');

vi.mock('src/tracking/run-tracker.js');
vi.mock('src/tracking/current-run-tracker.js');
vi.mock('src/tracking/failed-run-history-tracker.js');
vi.mock('src/utils/key-value-store.js');

const mockRunTracker = {} as RunTracker;
// eslint-disable-next-line prefer-arrow-callback
vi.mocked(RunTracker).mockImplementation(function () {
    return mockRunTracker;
});

const currentRunTrackerMock = {} as CurrentRunTracker;
// eslint-disable-next-line prefer-arrow-callback
vi.mocked(CurrentRunTracker).mockImplementation(function () {
    return currentRunTrackerMock;
});

const failedRunHistoryTrackerMock = {} as FailedRunHistoryTracker;
// eslint-disable-next-line prefer-arrow-callback
vi.mocked(FailedRunHistoryTracker).mockImplementation(function () {
    return failedRunHistoryTrackerMock;
});

const encryptedKeyValueStoreMock = {
    useState: vi.fn(),
} as unknown as EncryptedKeyValueStore;
// eslint-disable-next-line prefer-arrow-callback
vi.mocked(EncryptedKeyValueStore).mockImplementation(function () {
    return encryptedKeyValueStoreMock;
});

describe('buildRunTrackerForOrchestrator', () => {
    const logger = buildLogger(getTestOptions());
    const storage = buildStorage(logger, getTestOptions({ persistenceSupport: 'kvs' }));

    const useStateSpy = vi.spyOn(Actor, 'useState').mockResolvedValue({});

    afterEach(() => {
        vi.clearAllMocks();
    });

    it('builds RunTracker without FailedRunHistoryTracker when storage is undefined', async () => {
        const options = getTestOptions();
        const context: GlobalContext = { logger, storage: undefined };

        const runTracker = await buildRunTrackerForOrchestrator(context, options);

        expect(Actor.useState).not.toHaveBeenCalled();
        expect(EncryptedKeyValueStore).not.toHaveBeenCalled();
        expect(CurrentRunTracker).toHaveBeenCalledWith(context, {}, options.onUpdate);
        expect(FailedRunHistoryTracker).not.toHaveBeenCalled();
        expect(RunTracker).toHaveBeenCalledWith(context, expect.anything(), undefined);
        expect(runTracker).toBe(mockRunTracker);
    });

    it('builds RunTracker without FailedRunHistoryTracker when hideSensitiveInformation is true', async () => {
        const options = getTestOptions({ hideSensitiveInformation: true });
        const context: GlobalContext = { logger, storage };

        const runTracker = await buildRunTrackerForOrchestrator(context, options);

        expect(useStateSpy).toHaveBeenCalledTimes(1);
        expect(CurrentRunTracker).toHaveBeenCalledWith(context, {}, options.onUpdate);
        expect(FailedRunHistoryTracker).not.toHaveBeenCalled();
        expect(RunTracker).toHaveBeenCalledWith(context, expect.anything(), undefined);
        expect(runTracker).toBe(mockRunTracker);
    });

    it('builds RunTracker with FailedRunHistoryTracker', async () => {
        const options = getTestOptions({ hideSensitiveInformation: false });
        const context: GlobalContext = { logger, storage };

        const runTracker = await buildRunTrackerForOrchestrator(context, options);

        expect(useStateSpy).toHaveBeenCalledTimes(2);
        expect(CurrentRunTracker).toHaveBeenCalledWith(context, {}, options.onUpdate);
        expect(FailedRunHistoryTracker).toHaveBeenCalledWith(context, {});
        expect(RunTracker).toHaveBeenCalledWith(context, expect.anything(), expect.anything());
        expect(runTracker).toBe(mockRunTracker);
    });

    it('restores values from storage', async () => {
        const options = getTestOptions({ hideSensitiveInformation: false });
        const context: GlobalContext = { logger, storage };

        const storedCurrentRuns = {
            'run-1': { runId: 'abc123', status: 'SUCCEEDED', startedAt: '2024-01-01T00:00:00Z' },
        };
        const storedFailedRunHistory = {
            'run-2': [{ runId: 'def456', status: 'FAILED', startedAt: '2024-01-02T00:00:00Z' }],
        };

        vi.mocked(Actor.useState)
            .mockResolvedValueOnce(storedCurrentRuns)
            .mockResolvedValueOnce(storedFailedRunHistory);

        const runTracker = await buildRunTrackerForOrchestrator(context, options);

        expect(Actor.useState).toHaveBeenCalledTimes(2);
        expect(CurrentRunTracker).toHaveBeenCalledWith(context, storedCurrentRuns, options.onUpdate);
        expect(FailedRunHistoryTracker).toHaveBeenCalledWith(context, storedFailedRunHistory);
        expect(RunTracker).toHaveBeenCalledWith(context, expect.anything(), expect.anything());
        expect(runTracker).toBe(mockRunTracker);
    });
});
