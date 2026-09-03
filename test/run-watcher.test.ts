import { Actor } from 'apify';
import type { ActorRun } from 'apify-client';
import { RUN_WATCH_INTERVAL_MS, RUN_WATCH_SEGMENT_SECS } from 'src/constants.js';
import type { OrchestratorContext } from 'src/context/orchestrator-context.js';
import type { RunWatcherOptions } from 'src/run-watcher.js';
import { RunWatcher } from 'src/run-watcher.js';
import type { RunInfo } from 'src/types.js';
import { DeferredPromise } from 'src/utils/concurrency/deferred-promise.js';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { getTestContext } from './_helpers/context.js';
import { createActorRunMock } from './_helpers/mocks.js';

describe('RunWatcher', () => {
    let context: OrchestratorContext;
    let activeRuns: { [runName: string]: RunInfo };

    const waitForRunToFinish = vi.fn();

    function buildRunInfo(runId: string): RunInfo {
        return { runId, runUrl: `https://test.com/${runId}`, status: 'RUNNING', startedAt: '2026-01-01T00:00:00.000Z' };
    }

    function setActiveRuns(...runNames: string[]) {
        activeRuns = Object.fromEntries(runNames.map((runName) => [runName, buildRunInfo(`${runName}-id`)]));
    }

    function buildRunWatcher(overrideOptions?: Partial<RunWatcherOptions>) {
        const options: RunWatcherOptions = {
            getActiveRuns: () => activeRuns,
            waitForRunToFinish,
            ...overrideOptions,
        };
        return new RunWatcher(context, options);
    }

    /**
     * Simulates a Run which keeps running: every wait times out without the Run having terminated.
     */
    function mockRunStillRunning() {
        vi.mocked(waitForRunToFinish).mockResolvedValue(createActorRunMock({ status: 'RUNNING' }));
    }

    beforeAll(() => {
        vi.useFakeTimers();
    });

    beforeEach(() => {
        context = getTestContext();
        activeRuns = {};
        mockRunStillRunning();
    });

    afterEach(() => {
        // Stop the intervals of the watchers built by the test, which would otherwise keep scanning.
        Actor.config.getEventManager().emit('exit');
        vi.clearAllMocks();
    });

    afterAll(() => {
        vi.useRealTimers();
    });

    it('waits for every active run to finish', async () => {
        setActiveRuns('run-1', 'run-2');

        buildRunWatcher();

        await vi.advanceTimersByTimeAsync(RUN_WATCH_INTERVAL_MS);

        expect(waitForRunToFinish).toHaveBeenCalledTimes(2);
        expect(waitForRunToFinish).toHaveBeenCalledWith('run-1', 'run-1-id', RUN_WATCH_SEGMENT_SECS);
        expect(waitForRunToFinish).toHaveBeenCalledWith('run-2', 'run-2-id', RUN_WATCH_SEGMENT_SECS);
    });

    it('watches each run only once, no matter how many times it is scanned', async () => {
        setActiveRuns('run-1');

        // A wait which never returns, i.e. a Run which stays alive for the whole test.
        vi.mocked(waitForRunToFinish).mockReturnValue(new DeferredPromise<ActorRun>().wait());

        buildRunWatcher();

        await vi.advanceTimersByTimeAsync(RUN_WATCH_INTERVAL_MS * 5);

        expect(waitForRunToFinish).toHaveBeenCalledTimes(1);
    });

    it('watches a run again at the next scan, if it is still running', async () => {
        setActiveRuns('run-1');

        buildRunWatcher();

        await vi.advanceTimersByTimeAsync(RUN_WATCH_INTERVAL_MS);
        expect(waitForRunToFinish).toHaveBeenCalledTimes(1);

        await vi.advanceTimersByTimeAsync(RUN_WATCH_INTERVAL_MS);
        expect(waitForRunToFinish).toHaveBeenCalledTimes(2);
    });

    it('never asks more often than once per scan, even if a wait returns immediately', async () => {
        setActiveRuns('run-1');

        buildRunWatcher();

        // The waits resolve immediately with a Run which is still running: the scan interval is what
        // prevents the watcher from asking again in a loop.
        await vi.advanceTimersByTimeAsync(RUN_WATCH_INTERVAL_MS * 3);

        expect(waitForRunToFinish).toHaveBeenCalledTimes(3);
    });

    it('stops watching a run which is not active anymore', async () => {
        setActiveRuns('run-1');
        vi.mocked(waitForRunToFinish).mockResolvedValue(createActorRunMock({ status: 'SUCCEEDED' }));

        buildRunWatcher();

        await vi.advanceTimersByTimeAsync(RUN_WATCH_INTERVAL_MS);
        expect(waitForRunToFinish).toHaveBeenCalledTimes(1);

        // A terminated or lost Run is dropped from the active Runs by the Run tracker.
        activeRuns = {};
        await vi.advanceTimersByTimeAsync(RUN_WATCH_INTERVAL_MS * 3);
        expect(waitForRunToFinish).toHaveBeenCalledTimes(1);
    });

    it('watches a run again after a failed wait', async () => {
        setActiveRuns('run-1');
        vi.mocked(waitForRunToFinish).mockRejectedValueOnce(new Error('Network error'));

        buildRunWatcher();

        await vi.advanceTimersByTimeAsync(RUN_WATCH_INTERVAL_MS);
        expect(waitForRunToFinish).toHaveBeenCalledTimes(1);

        await vi.advanceTimersByTimeAsync(RUN_WATCH_INTERVAL_MS);
        expect(waitForRunToFinish).toHaveBeenCalledTimes(2);
    });

    it('only watches the runs which are active at the time of the scan', async () => {
        buildRunWatcher();

        await vi.advanceTimersByTimeAsync(RUN_WATCH_INTERVAL_MS);
        expect(waitForRunToFinish).not.toHaveBeenCalled();

        setActiveRuns('run-1');

        await vi.advanceTimersByTimeAsync(RUN_WATCH_INTERVAL_MS);
        expect(waitForRunToFinish).toHaveBeenCalledWith('run-1', 'run-1-id', RUN_WATCH_SEGMENT_SECS);
    });

    for (const event of ['migrating', 'exit', 'aborting'] as const) {
        it(`stops watching on "${event}" event`, async () => {
            setActiveRuns('run-1');

            const runWatcher = buildRunWatcher();

            // eslint-disable-next-line dot-notation
            expect(runWatcher['interval'].isStopped()).toBe(false);

            Actor.config.getEventManager().emit(event);

            // eslint-disable-next-line dot-notation
            expect(runWatcher['interval'].isStopped()).toBe(true);

            await vi.advanceTimersByTimeAsync(RUN_WATCH_INTERVAL_MS * 2);
            expect(waitForRunToFinish).not.toHaveBeenCalled();
        });
    }
});
