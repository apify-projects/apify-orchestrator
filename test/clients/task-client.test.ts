import type { ActorRun, RunClient } from 'apify-client';
import { TaskClient } from 'apify-client';
import { ExtApifyClient } from 'src/clients/apify-client.js';
import { ExtRunClient } from 'src/clients/run-client.js';
import { DEFAULT_ORCHESTRATOR_OPTIONS, MAIN_LOOP_COOLDOWN_MS } from 'src/constants.js';
import { RunsTracker } from 'src/tracker.js';
import type { OrchestratorOptions } from 'src/types.js';
import type { OrchestratorContext } from 'src/utils/context.js';
import { CustomLogger } from 'src/utils/logging.js';

describe('ExtTaskClient', () => {
    let context: OrchestratorContext;
    let options: OrchestratorOptions;

    const generateApifyClient = (clientName: string) => new ExtApifyClient(context, { clientName, ...options });

    const mockDate = new Date('2024-09-11T06:00:00.000Z');

    const getMockRun = (id: string, status = 'READY', defaultDatasetId = 'test-dataset-id') => {
        return {
            id,
            status,
            defaultDatasetId,
            startedAt: mockDate,
        } as ActorRun;
    };

    beforeEach(async () => {
        vi.useFakeTimers();
        const logger = new CustomLogger(false, false);
        const runsTracker = new RunsTracker(logger, false);
        context = { logger, runsTracker };
        await context.runsTracker.init();
        options = {
            ...DEFAULT_ORCHESTRATOR_OPTIONS,
            enableLogs: false,
        };
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.resetAllMocks();
    });

    describe('start', () => {
        it('returns an existing Run, if already available', async () => {
            const client = generateApifyClient('test-client');
            const taskClient = client.task('test-task-id');

            // Add an existing run to the tracker
            const existingRun = getMockRun('existing-run-id', 'RUNNING');
            await context.runsTracker.updateRun('test-run', existingRun);

            // Mock the RunClient.get method to return the existing run
            const getSpy = vi.spyOn(ExtRunClient.prototype, 'get').mockImplementation(async () => {
                return existingRun;
            });

            const result = await taskClient.start('test-run', { testInput: 'value' });

            expect(result).toEqual(existingRun);
            expect(getSpy).toHaveBeenCalled();
        });

        it('enqueues a new request, if an existing Run was found but is not available', async () => {
            const client = generateApifyClient('test-client');
            client.startScheduler();
            const taskClient = client.task('test-task-id');

            // Add an existing run to the tracker with FAILED status so it won't be reused
            const existingRun = getMockRun('existing-run-id', 'FAILED');
            await context.runsTracker.updateRun('test-run', existingRun);

            const newRun = getMockRun('new-run-id', 'READY');
            const startSpy = vi.spyOn(TaskClient.prototype, 'start').mockImplementation(async () => {
                return newRun;
            });

            const runInput = { testInput: 'value' };
            const startPromise = taskClient.start('test-run', runInput);
            vi.advanceTimersByTime(MAIN_LOOP_COOLDOWN_MS);
            await vi.waitUntil(() => !client.isSchedulerLocked, 2_000);
            const result = await startPromise;

            expect(startSpy).toHaveBeenCalledWith(runInput, undefined);
            expect(result).toEqual(newRun);
        });

        it('enqueues a new request, if an existing Run was not found', async () => {
            const client = generateApifyClient('test-client');
            client.startScheduler();
            const taskClient = client.task('test-task-id');

            const newRun = getMockRun('new-run-id', 'READY');
            const startSpy = vi.spyOn(TaskClient.prototype, 'start').mockImplementation(async () => {
                return newRun;
            });

            const runInput = { testInput: 'value' };
            const startPromise = taskClient.start('test-run', runInput);
            vi.advanceTimersByTime(MAIN_LOOP_COOLDOWN_MS);
            await vi.waitUntil(() => !client.isSchedulerLocked, 2_000);
            const result = await startPromise;

            expect(startSpy).toHaveBeenCalledWith(runInput, undefined);
            expect(result).toEqual(newRun);
        });
    });

    describe('call', () => {
        it('waits for a Run to finish', async () => {
            const client = generateApifyClient('test-client');
            client.startScheduler();
            const taskClient = client.task('test-task-id');

            const newRun = getMockRun('new-run-id', 'READY');
            const finishedRun = getMockRun('new-run-id', 'SUCCEEDED');

            const startSpy = vi.spyOn(TaskClient.prototype, 'start').mockImplementation(async () => {
                return newRun;
            });

            const waitSpy = vi.spyOn(ExtRunClient.prototype, 'waitForFinish').mockImplementation(async () => {
                return finishedRun;
            });

            const callPromise = taskClient.call('test-run', { testInput: 'value' });
            vi.advanceTimersByTime(MAIN_LOOP_COOLDOWN_MS);
            await vi.waitUntil(() => !client.isSchedulerLocked, 2_000);
            const result = await callPromise;

            expect(startSpy).toHaveBeenCalled();
            expect(waitSpy).toHaveBeenCalled();
            expect(result).toEqual(finishedRun);
        });
    });

    describe('enqueue', () => {
        it('enqueues multiple run requests', async () => {
            const client = generateApifyClient('test-client');
            const taskClient = client.task('test-task-id');

            const runNames = taskClient.enqueue(
                { runName: 'run-1', input: { data: 1 } },
                { runName: 'run-2', input: { data: 2 } },
            );

            expect(runNames).toEqual(['run-1', 'run-2']);
        });
    });

    describe('startRuns', () => {
        it('starts multiple runs in parallel', async () => {
            const client = generateApifyClient('test-client');
            client.startScheduler();
            const taskClient = client.task('test-task-id');

            const run1 = getMockRun('run-1-id', 'READY');
            const run2 = getMockRun('run-2-id', 'READY');

            let callCount = 0;
            const startSpy = vi.spyOn(TaskClient.prototype, 'start').mockImplementation(async () => {
                return callCount++ === 0 ? run1 : run2;
            });

            const startPromise = taskClient.startRuns(
                { runName: 'run-1', input: { data: 1 } },
                { runName: 'run-2', input: { data: 2 } },
            );

            vi.advanceTimersByTime(MAIN_LOOP_COOLDOWN_MS * 2);
            await vi.waitUntil(() => !client.isSchedulerLocked, 2_000);
            const result = await startPromise;

            expect(result).toHaveProperty('run-1');
            expect(result).toHaveProperty('run-2');
            expect(startSpy).toHaveBeenCalled();
        });
    });

    describe('fixed input handling', () => {
        it('merges fixed input with run input', async () => {
            const client = generateApifyClient('test-client');
            client.startScheduler();

            options.fixedInput = { fixedKey: 'fixedValue' };
            const clientWithFixedInput = new ExtApifyClient(context, {
                clientName: 'test-fixed',
                ...options,
            });
            clientWithFixedInput.startScheduler();
            const taskClient = clientWithFixedInput.task('test-task-id');

            const newRun = getMockRun('new-run-id', 'READY');
            const startSpy = vi.spyOn(TaskClient.prototype, 'start').mockImplementation(async () => {
                return newRun;
            });

            const startPromise = taskClient.start('test-run', { testKey: 'testValue' });
            vi.advanceTimersByTime(MAIN_LOOP_COOLDOWN_MS);
            await vi.waitUntil(() => !clientWithFixedInput.isSchedulerLocked, 2_000);
            await startPromise;

            expect(startSpy).toHaveBeenCalledWith({ testKey: 'testValue', fixedKey: 'fixedValue' }, undefined);
        });
    });

    describe('lastRun', () => {
        it('returns a tracked RunClient if the run is in the tracker', async () => {
            const client = generateApifyClient('test-client');
            const taskClient = client.task('test-task-id');

            const existingRun = getMockRun('run-id', 'RUNNING');
            await context.runsTracker.updateRun('test-run', existingRun);

            // Mock the TaskClient.lastRun to return a RunClient with the tracked run ID
            const mockRunClient = { id: 'run-id' } as RunClient;
            const lastRunSpy = vi.spyOn(TaskClient.prototype, 'lastRun').mockReturnValue(mockRunClient);

            const result = taskClient.lastRun();

            expect(result).toBeInstanceOf(ExtRunClient);
            expect(lastRunSpy).toHaveBeenCalled();
        });
    });
});
