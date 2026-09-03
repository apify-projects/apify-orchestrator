import { Actor } from 'apify';
import { MAIN_LOOP_INTERVAL_MS } from 'src/constants.js';
import type { OrchestratorContext } from 'src/context/orchestrator-context.js';
import type { RunSource } from 'src/entities/run-source.js';
import { InsufficientMemoryError } from 'src/errors.js';
import type { RunSchedulerOptions, RunStartRequest } from 'src/run-scheduler.js';
import { RunScheduler } from 'src/run-scheduler.js';
import * as trySync from 'src/utils/concurrency/try-sync.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { getTestContext, getTestOptions } from './_helpers/context.js';
import { createActorRunMock, createMockRunSource } from './_helpers/mocks.js';

function getAttemptProcessingAllRequests(runScheduler: RunScheduler) {
    // eslint-disable-next-line dot-notation
    return runScheduler['attemptProcessingAllRequests'].bind(runScheduler);
}

describe('RunScheduler', () => {
    let context: OrchestratorContext;

    const onRunStarted = vi.fn();

    const runMock = createActorRunMock();

    let activeRunsCount = 0;

    function buildRunScheduler(overrideOptions?: Partial<RunSchedulerOptions>) {
        const options: RunSchedulerOptions = {
            runRequestAdapter: (request) => request,
            onRunStarted,
            countActiveRuns: () => activeRunsCount,
            ...overrideOptions,
        };
        return new RunScheduler(context, options);
    }

    beforeEach(() => {
        activeRunsCount = 0;
        context = getTestContext(getTestOptions({ retryOnInsufficientResources: true }));
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    for (const event of ['migrating', 'exit', 'aborting'] as const) {
        it(`sets up the shutdown hook on "${event}" event`, () => {
            const eventManager = Actor.config.getEventManager();

            const runScheduler = buildRunScheduler();

            // eslint-disable-next-line dot-notation
            expect(runScheduler['shutdownGate']['isOpen']).toBe(true);
            // eslint-disable-next-line dot-notation
            expect(runScheduler['interval'].isStopped()).toBe(false);

            eventManager.emit(event);

            // eslint-disable-next-line dot-notation
            expect(runScheduler['shutdownGate']['isOpen']).toBe(false);
            // eslint-disable-next-line dot-notation
            expect(runScheduler['interval'].isStopped()).toBe(true);
        });
    }

    it('requests a run start and returns a promise', async () => {
        vi.useFakeTimers();

        const runScheduler = buildRunScheduler();
        const mockSource = createMockRunSource(runMock);

        const runRequest: RunStartRequest = {
            source: mockSource,
            name: 'test-run',
            input: { key: 'value' },
        };

        const waitFn = runScheduler.requestRunStart(runRequest);
        expect(typeof waitFn).toBe('function');

        // The run should be findable by name
        const foundWaitFn = runScheduler.findRunStartRequest('test-run');
        expect(foundWaitFn).toBeDefined();

        vi.advanceTimersByTime(MAIN_LOOP_INTERVAL_MS);

        // Both functions should resolve to the same run
        const [result1, result2] = await Promise.all([waitFn(), foundWaitFn()]);
        expect(result1).toBe(result2);

        vi.useRealTimers();
    });

    it('starts a run immediately', async () => {
        const runScheduler = buildRunScheduler();
        const mockSource = createMockRunSource(runMock);

        const runRequest: RunStartRequest = {
            source: mockSource,
            name: 'test-run',
            input: { key: 'value' },
        };

        const run = await runScheduler.startRun(runRequest);

        expect(run).toBeDefined();
        expect(run.id).toBe('test-run-id');
        expect(mockSource.start).toHaveBeenCalledWith({ key: 'value' }, undefined);
        expect(onRunStarted).toHaveBeenCalledWith('test-run', run);
    });

    it('does not start duplicate runs with the same name', async () => {
        const runScheduler = buildRunScheduler();
        const mockSource = createMockRunSource(runMock);

        const runRequest: RunStartRequest = {
            source: mockSource,
            name: 'test-run',
            input: { key: 'value' },
        };

        // Request the same run twice
        const waitFn1 = runScheduler.requestRunStart(runRequest);
        const waitFn2 = runScheduler.requestRunStart(runRequest);

        // Start processing once
        await runScheduler.startRun(runRequest);

        // Both functions should resolve to the same run
        const [result1, result2] = await Promise.all([waitFn1(), waitFn2()]);
        expect(result1).toBe(result2);

        // The run should have been started only once
        expect(mockSource.start).toHaveBeenCalledTimes(1);
    });

    it('applies the runRequestAdapter before starting', async () => {
        const runRequestAdapter = vi.fn((request) => ({
            ...request,
            input: { ...request.input, adapted: true },
        }));

        const runScheduler = buildRunScheduler({ runRequestAdapter });
        const mockSource = createMockRunSource(runMock);

        const runRequest: RunStartRequest = {
            source: mockSource,
            name: 'test-run',
            input: { key: 'value' },
        };

        await runScheduler.startRun(runRequest);

        expect(runRequestAdapter).toHaveBeenCalledWith(runRequest);
        expect(mockSource.start).toHaveBeenCalledWith({ key: 'value', adapted: true }, undefined);
    });

    it('returns undefined when finding a non-existent run', () => {
        const runScheduler = buildRunScheduler();

        const foundWaitFn = runScheduler.findRunStartRequest('non-existent-run');
        expect(foundWaitFn).toBeUndefined();
    });

    it('handles run start failures', async () => {
        const runScheduler = buildRunScheduler();
        const mockSource = createMockRunSource(runMock);

        const error = new Error('Failed to start run');
        vi.mocked(mockSource.start).mockRejectedValue(error);

        const runRequest: RunStartRequest = {
            source: mockSource,
            name: 'failing-run',
            input: { key: 'value' },
        };

        await expect(runScheduler.startRun(runRequest)).rejects.toThrow('Failed to start run');
        expect(mockSource.start).toHaveBeenCalledTimes(1);
    });

    describe('attemptProcessingAllRequests', () => {
        it('processes all pending requests', async () => {
            const runScheduler = buildRunScheduler();
            const mockSource = createMockRunSource(runMock);

            const runRequest1: RunStartRequest = {
                source: mockSource,
                name: 'run-1',
                input: { key: 'value1' },
            };
            const runRequest2: RunStartRequest = {
                source: mockSource,
                name: 'run-2',
                input: { key: 'value2' },
            };

            runScheduler.requestRunStart(runRequest1);
            runScheduler.requestRunStart(runRequest2);

            const attemptProcessingAllRequests = getAttemptProcessingAllRequests(runScheduler);

            await attemptProcessingAllRequests();

            // Both runs should have been started
            expect(mockSource.start).toHaveBeenCalledTimes(2);
            expect(mockSource.start).toHaveBeenCalledWith({ key: 'value1' }, undefined);
            expect(mockSource.start).toHaveBeenCalledWith({ key: 'value2' }, undefined);
        });

        it('does nothing if already processing', async () => {
            const runScheduler = buildRunScheduler();
            const mockSource = createMockRunSource(runMock);

            const runRequest: RunStartRequest = {
                source: mockSource,
                name: 'run-1',
                input: { key: 'value1' },
            };

            runScheduler.requestRunStart(runRequest);

            const attemptProcessingAllRequests = getAttemptProcessingAllRequests(runScheduler);

            const attempt1 = attemptProcessingAllRequests();
            const attempt2 = attemptProcessingAllRequests();

            await Promise.all([attempt1, attempt2]);

            // The run should have been started only once
            expect(mockSource.start).toHaveBeenCalledTimes(1);
            expect(mockSource.start).toHaveBeenCalledWith({ key: 'value1' }, undefined);
        });

        it('stops processing if shutting down', async () => {
            const runScheduler = buildRunScheduler();
            const mockSource = createMockRunSource(runMock);

            const runRequest: RunStartRequest = {
                source: mockSource,
                name: 'run-1',
                input: { key: 'value1' },
            };

            runScheduler.requestRunStart(runRequest);

            // Trigger shutdown
            Actor.config.getEventManager().emit('exit');

            const attemptProcessingAllRequests = getAttemptProcessingAllRequests(runScheduler);

            await attemptProcessingAllRequests();

            // The run should not have been started
            expect(mockSource.start).not.toHaveBeenCalled();
        });

        it('stops processing if retry cooldown is active', async () => {
            const synchronizedAttemptSpy = vi.spyOn(trySync, 'synchronizedAttempt');

            const runScheduler = buildRunScheduler();
            const mockSource = createMockRunSource(runMock);

            const runRequest1: RunStartRequest = {
                source: mockSource,
                name: 'run-1',
                input: { key: 'value1' },
            };
            const runRequest2: RunStartRequest = {
                source: mockSource,
                name: 'run-2',
                input: { key: 'value2' },
            };
            const runRequest3: RunStartRequest = {
                source: mockSource,
                name: 'run-3',
                input: { key: 'value3' },
            };

            runScheduler.requestRunStart(runRequest1);
            runScheduler.requestRunStart(runRequest2);
            runScheduler.requestRunStart(runRequest3);

            vi.mocked(mockSource.start).mockRejectedValue(new InsufficientMemoryError('run-1', 8192));

            const attemptProcessingAllRequests = getAttemptProcessingAllRequests(runScheduler);

            await attemptProcessingAllRequests();

            expect(mockSource.start).toHaveBeenCalledTimes(1);
            expect(mockSource.start).toHaveBeenCalledWith({ key: 'value1' }, undefined);

            // First call: cooldown triggered. Second call: cooldown detected. Third call: skipped.
            expect(synchronizedAttemptSpy).toHaveBeenCalledTimes(2);

            expect(mockSource.start).not.toHaveBeenCalledWith({ key: 'value2' }, undefined);
            expect(mockSource.start).not.toHaveBeenCalledWith({ key: 'value3' }, undefined);
        });
    });

    describe('maxConcurrencyPerClient', () => {
        function buildLimitedRunScheduler(maxConcurrencyPerClient?: number) {
            context = getTestContext(getTestOptions({ retryOnInsufficientResources: true, maxConcurrencyPerClient }));
            // Count every Run which was started and not terminated yet, as the Run tracker would.
            return buildRunScheduler({
                onRunStarted: (runName, run) => {
                    activeRunsCount += 1;
                    onRunStarted(runName, run);
                },
            });
        }

        function buildRunRequests(mockSource: RunSource, count: number): RunStartRequest[] {
            return Array.from({ length: count }, (_, index) => ({
                source: mockSource,
                name: `run-${index + 1}`,
                input: { key: `value${index + 1}` },
            }));
        }

        it('starts no more runs than the limit allows', async () => {
            const runScheduler = buildLimitedRunScheduler(2);
            const mockSource = createMockRunSource(runMock);

            for (const runRequest of buildRunRequests(mockSource, 3)) {
                runScheduler.requestRunStart(runRequest);
            }

            const attemptProcessingAllRequests = getAttemptProcessingAllRequests(runScheduler);
            await attemptProcessingAllRequests();

            expect(mockSource.start).toHaveBeenCalledTimes(2);
            expect(mockSource.start).toHaveBeenCalledWith({ key: 'value1' }, undefined);
            expect(mockSource.start).toHaveBeenCalledWith({ key: 'value2' }, undefined);

            // Further attempts change nothing while the started Runs are still active.
            await attemptProcessingAllRequests();
            expect(mockSource.start).toHaveBeenCalledTimes(2);

            // As soon as one of the Runs terminates, the pending request is processed.
            activeRunsCount -= 1;
            await attemptProcessingAllRequests();

            expect(mockSource.start).toHaveBeenCalledTimes(3);
            expect(mockSource.start).toHaveBeenCalledWith({ key: 'value3' }, undefined);
        });

        it('counts the runs which were already active before scheduling', async () => {
            const runScheduler = buildLimitedRunScheduler(2);
            const mockSource = createMockRunSource(runMock);

            // E.g., Runs restored through persistence, or started by another method.
            activeRunsCount = 2;

            runScheduler.requestRunStart(buildRunRequests(mockSource, 1)[0]);
            await getAttemptProcessingAllRequests(runScheduler)();

            expect(mockSource.start).not.toHaveBeenCalled();
        });

        it('defers an immediate run start until there is capacity', async () => {
            const runScheduler = buildLimitedRunScheduler(1);
            const mockSource = createMockRunSource(runMock);

            activeRunsCount = 1;

            const [runRequest] = buildRunRequests(mockSource, 1);
            const runPromise = runScheduler.startRun(runRequest);

            // Let the immediate attempt, which is expected to be blocked, complete.
            await new Promise((resolve) => {
                setTimeout(resolve, 0);
            });
            expect(mockSource.start).not.toHaveBeenCalled();

            activeRunsCount = 0;
            await getAttemptProcessingAllRequests(runScheduler)();

            await expect(runPromise).resolves.toBe(runMock);
            expect(mockSource.start).toHaveBeenCalledTimes(1);
        });

        it('does not limit the concurrency if no limit is defined', async () => {
            const runScheduler = buildLimitedRunScheduler(undefined);
            const mockSource = createMockRunSource(runMock);

            activeRunsCount = 100;

            for (const runRequest of buildRunRequests(mockSource, 3)) {
                runScheduler.requestRunStart(runRequest);
            }

            await getAttemptProcessingAllRequests(runScheduler)();

            expect(mockSource.start).toHaveBeenCalledTimes(3);
        });
    });
});
