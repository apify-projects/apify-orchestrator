import { Actor } from 'apify';
import { buildRunTrackerForOrchestrator } from 'src/tracking/builder.js';
import { CurrentRunTracker } from 'src/tracking/current-run-tracker.js';
import { FailedRunHistoryTracker } from 'src/tracking/failed-run-history-tracker.js';
import { RunTracker } from 'src/tracking/run-tracker.js';
import { EncryptedKeyValueStore } from 'src/utils/key-value-store.js';
import { getTestGlobalContext, getTestOptions } from 'test/_helpers/context.js';
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
    afterEach(() => {
        vi.clearAllMocks();
    });

    it('builds RunTracker without storage when persistenceSupport is none', async () => {
        const options = getTestOptions({ persistenceSupport: 'none', hideSensitiveInformation: false });
        const context = getTestGlobalContext(options);

        const runTracker = await buildRunTrackerForOrchestrator(context, options);

        expect(Actor.useState).not.toHaveBeenCalled();
        expect(EncryptedKeyValueStore).not.toHaveBeenCalled();
        expect(CurrentRunTracker).toHaveBeenCalledWith(context, {}, options.onUpdate);
        expect(FailedRunHistoryTracker).not.toHaveBeenCalled();
        expect(RunTracker).toHaveBeenCalledWith(context, expect.anything(), undefined);
        expect(runTracker).toBe(mockRunTracker);
    });

    it('builds RunTracker without FailedRunHistoryTracker when hideSensitiveInformation is true', async () => {
        const options = getTestOptions({ persistenceSupport: 'kvs', hideSensitiveInformation: true });
        const context = getTestGlobalContext(options);

        const runTracker = await buildRunTrackerForOrchestrator(context, options);

        expect(CurrentRunTracker).toHaveBeenCalledWith(context, {}, options.onUpdate);
        expect(FailedRunHistoryTracker).not.toHaveBeenCalled();
        expect(RunTracker).toHaveBeenCalledWith(context, expect.anything(), undefined);
        expect(runTracker).toBe(mockRunTracker);
    });

    it('builds RunTracker with storage when persistenceSupport is kvs', async () => {
        const options = getTestOptions({ persistenceSupport: 'kvs', hideSensitiveInformation: false });
        const context = getTestGlobalContext(options);

        vi.mocked(Actor.useState).mockResolvedValue({});

        const runTracker = await buildRunTrackerForOrchestrator(context, options);

        expect(Actor.useState).toHaveBeenCalled();
        expect(CurrentRunTracker).toHaveBeenCalledWith(context, {}, options.onUpdate);
        expect(FailedRunHistoryTracker).toHaveBeenCalledWith(context, {});
        expect(RunTracker).toHaveBeenCalledWith(context, expect.anything(), expect.anything());
        expect(runTracker).toBe(mockRunTracker);
    });

    it('builds RunTracker without FailedRunHistoryTracker when hideSensitiveInformation is true', async () => {
        const options = getTestOptions({ persistenceSupport: 'none', hideSensitiveInformation: true });
        const context = getTestGlobalContext(options);

        const runTracker = await buildRunTrackerForOrchestrator(context, options);

        expect(CurrentRunTracker).toHaveBeenCalledWith(context, {}, options.onUpdate);
        expect(FailedRunHistoryTracker).not.toHaveBeenCalled();
        expect(RunTracker).toHaveBeenCalledWith(context, expect.anything(), undefined);
        expect(runTracker).toBe(mockRunTracker);
    });

    it('builds RunTracker with storage and encryptionKey when provided', async () => {
        const options = getTestOptions({
            persistenceSupport: 'kvs',
            persistenceEncryptionKey: 'my-secret-key',
            hideSensitiveInformation: false,
        });
        const context = getTestGlobalContext(options);

        vi.mocked(encryptedKeyValueStoreMock.useState).mockResolvedValue({});

        const runTracker = await buildRunTrackerForOrchestrator(context, options);

        expect(EncryptedKeyValueStore).toHaveBeenCalled();
        expect(CurrentRunTracker).toHaveBeenCalledWith(context, {}, options.onUpdate);
        expect(FailedRunHistoryTracker).toHaveBeenCalledWith(context, {});
        expect(RunTracker).toHaveBeenCalledWith(context, expect.anything(), expect.anything());
        expect(runTracker).toBe(mockRunTracker);
    });

    it('restores values from storage', async () => {
        const options = getTestOptions({ persistenceSupport: 'kvs', hideSensitiveInformation: false });
        const context = getTestGlobalContext(options);

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
