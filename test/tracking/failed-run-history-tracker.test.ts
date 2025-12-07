import { FailedRunHistoryTracker } from 'src/tracking/failed-run-history-tracker.js';
import { getTestGlobalContext, getTestOptions } from 'test/_helpers/context.js';
import { describe, expect, it, vi } from 'vitest';

describe('FailedRunHistoryTracker', () => {
    const options = getTestOptions();
    const context = getTestGlobalContext(options);

    afterEach(() => {
        vi.clearAllMocks();
    });

    it('restores failed runs from storage correctly', async () => {
        const existingRun = {
            runId: 'test-run-1',
            runUrl: 'https://test.com/test-run-1',
            status: 'ABORTED' as const,
            startedAt: '2024-09-11T06:00:00.000Z',
        };
        const initialHistory = {
            'test-actor-1': [existingRun],
        };

        const failedRunHistoryTracker = new FailedRunHistoryTracker(context, initialHistory);

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        expect((failedRunHistoryTracker as any).failedRunsHistory['test-actor-1']).toHaveLength(1);
    });

    it('adds or updates failed runs correctly', async () => {
        const failedRunHistoryTracker = new FailedRunHistoryTracker(context, {});

        const failedRun1 = {
            runId: 'test-run-1',
            runUrl: 'https://test.com/test-run-1',
            status: 'ABORTED' as const,
            startedAt: '2024-09-11T06:00:00.000Z',
        };

        failedRunHistoryTracker.addOrUpdateFailedRun('test-actor-1', failedRun1);

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        expect((failedRunHistoryTracker as any).failedRunsHistory['test-actor-1']).toHaveLength(1);

        const failedRun2 = {
            runId: 'test-run-2',
            runUrl: 'https://test.com/test-run-2',
            status: 'FAILED' as const,
            startedAt: '2024-09-11T06:00:00.000Z',
        };

        failedRunHistoryTracker.addOrUpdateFailedRun('test-actor-1', failedRun2);

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        expect((failedRunHistoryTracker as any).failedRunsHistory['test-actor-1']).toHaveLength(2);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        expect((failedRunHistoryTracker as any).failedRunsHistory['test-actor-1']).toEqual([failedRun1, failedRun2]);

        const failedRun3 = {
            runId: 'test-run-3',
            runUrl: 'https://test.com/test-run-3',
            status: 'ABORTED' as const,
            startedAt: '2024-09-11T06:00:00.000Z',
        };

        failedRunHistoryTracker.addOrUpdateFailedRun('test-actor-2', failedRun3);

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        expect((failedRunHistoryTracker as any).failedRunsHistory['test-actor-1']).toHaveLength(2);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        expect((failedRunHistoryTracker as any).failedRunsHistory['test-actor-1']).toEqual([failedRun1, failedRun2]);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        expect((failedRunHistoryTracker as any).failedRunsHistory['test-actor-2']).toHaveLength(1);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        expect((failedRunHistoryTracker as any).failedRunsHistory['test-actor-2']).toEqual([failedRun3]);
    });
});
