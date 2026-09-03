import { Actor } from 'apify';
import { RUN_STATUS_POLL_INTERVAL_MS } from 'src/constants.js';
import type { OrchestratorContext } from 'src/context/orchestrator-context.js';
import type { RunStatusPollerOptions } from 'src/run-status-poller.js';
import { RunStatusPoller } from 'src/run-status-poller.js';
import type { RunInfo } from 'src/types.js';
import { DeferredPromise } from 'src/utils/concurrency/deferred-promise.js';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { getTestContext } from './_helpers/context.js';

describe('RunStatusPoller', () => {
    let context: OrchestratorContext;
    let activeRuns: { [runName: string]: RunInfo };

    const refreshRun = vi.fn();

    function buildRunInfo(runId: string): RunInfo {
        return { runId, runUrl: `https://test.com/${runId}`, status: 'RUNNING', startedAt: '2026-01-01T00:00:00.000Z' };
    }

    function setActiveRuns(...runNames: string[]) {
        activeRuns = Object.fromEntries(runNames.map((runName) => [runName, buildRunInfo(`${runName}-id`)]));
    }

    function buildRunStatusPoller(overrideOptions?: Partial<RunStatusPollerOptions>) {
        const options: RunStatusPollerOptions = {
            getActiveRuns: () => activeRuns,
            refreshRun,
            ...overrideOptions,
        };
        return new RunStatusPoller(context, options);
    }

    beforeAll(() => {
        vi.useFakeTimers();
    });

    beforeEach(() => {
        context = getTestContext();
        activeRuns = {};
        vi.mocked(refreshRun).mockResolvedValue(undefined);
    });

    afterEach(() => {
        // Stop the intervals of the pollers built by the test, which would otherwise keep ticking.
        Actor.config.getEventManager().emit('exit');
        vi.clearAllMocks();
    });

    afterAll(() => {
        vi.useRealTimers();
    });

    it('refreshes all the active runs on every interval tick', async () => {
        setActiveRuns('run-1', 'run-2');

        buildRunStatusPoller();

        await vi.advanceTimersByTimeAsync(RUN_STATUS_POLL_INTERVAL_MS);

        expect(refreshRun).toHaveBeenCalledTimes(2);
        expect(refreshRun).toHaveBeenCalledWith('run-1', 'run-1-id');
        expect(refreshRun).toHaveBeenCalledWith('run-2', 'run-2-id');

        await vi.advanceTimersByTimeAsync(RUN_STATUS_POLL_INTERVAL_MS);

        expect(refreshRun).toHaveBeenCalledTimes(4);
    });

    it('does not refresh anything before the first tick', async () => {
        setActiveRuns('run-1');

        buildRunStatusPoller();

        await vi.advanceTimersByTimeAsync(RUN_STATUS_POLL_INTERVAL_MS - 1);

        expect(refreshRun).not.toHaveBeenCalled();
    });

    it('only refreshes the runs which are active at the time of the tick', async () => {
        buildRunStatusPoller();

        await vi.advanceTimersByTimeAsync(RUN_STATUS_POLL_INTERVAL_MS);
        expect(refreshRun).not.toHaveBeenCalled();

        setActiveRuns('run-1');

        await vi.advanceTimersByTimeAsync(RUN_STATUS_POLL_INTERVAL_MS);
        expect(refreshRun).toHaveBeenCalledExactlyOnceWith('run-1', 'run-1-id');
    });

    it('does not start a new refresh while the previous one is in progress', async () => {
        setActiveRuns('run-1');

        // A refresh which only completes when we decide so.
        const pendingRefresh = new DeferredPromise<void>();
        vi.mocked(refreshRun).mockImplementation(async () => pendingRefresh.wait());

        buildRunStatusPoller();

        await vi.advanceTimersByTimeAsync(RUN_STATUS_POLL_INTERVAL_MS * 3);
        expect(refreshRun).toHaveBeenCalledTimes(1);

        // Once the first refresh completes, the following tick starts a new one.
        pendingRefresh.resolve(undefined);
        await vi.advanceTimersByTimeAsync(RUN_STATUS_POLL_INTERVAL_MS);
        expect(refreshRun).toHaveBeenCalledTimes(2);
    });

    it('keeps polling when refreshing a run fails', async () => {
        setActiveRuns('run-1', 'run-2');
        vi.mocked(refreshRun).mockRejectedValueOnce(new Error('Network error'));

        buildRunStatusPoller();

        await vi.advanceTimersByTimeAsync(RUN_STATUS_POLL_INTERVAL_MS);
        expect(refreshRun).toHaveBeenCalledTimes(2);

        await vi.advanceTimersByTimeAsync(RUN_STATUS_POLL_INTERVAL_MS);
        expect(refreshRun).toHaveBeenCalledTimes(4);
    });

    for (const event of ['migrating', 'exit', 'aborting'] as const) {
        it(`stops polling on "${event}" event`, async () => {
            setActiveRuns('run-1');

            const runStatusPoller = buildRunStatusPoller();

            // eslint-disable-next-line dot-notation
            expect(runStatusPoller['interval'].isStopped()).toBe(false);

            Actor.config.getEventManager().emit(event);

            // eslint-disable-next-line dot-notation
            expect(runStatusPoller['interval'].isStopped()).toBe(true);

            await vi.advanceTimersByTimeAsync(RUN_STATUS_POLL_INTERVAL_MS * 2);
            expect(refreshRun).not.toHaveBeenCalled();
        });
    }
});
