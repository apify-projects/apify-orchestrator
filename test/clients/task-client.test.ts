import type { ActorRun, RunClient } from 'apify-client';
import { TaskClient } from 'apify-client';
import { ExtApifyClient } from 'src/clients/apify-client.js';
import { ExtRunClient } from 'src/clients/run-client.js';
import { MAIN_LOOP_COOLDOWN_MS } from 'src/constants.js';
import { RunTracker } from 'src/run-tracker.js';
import type { OrchestratorOptions } from 'src/types.js';
import type { OrchestratorContext } from 'src/utils/context.js';
import { getTestGlobalContext, getTestOptions } from 'test/_helpers/context.js';

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
        options = getTestOptions();
        const globalContext = getTestGlobalContext(options);
        const { logger } = globalContext;
        const runTracker = await RunTracker.new(globalContext);
        context = { logger, runTracker };
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
            context.runTracker.updateRun('test-run', existingRun);

            // Mock the RunClient.get method to return the existing run
            const getSpy = vi.spyOn(ExtRunClient.prototype, 'get').mockImplementation(async () => {
                return existingRun;
            });

            const result = await taskClient.start({ testInput: 'value' }, { runName: 'test-run' });

            expect(result).toEqual(existingRun);
            expect(getSpy).toHaveBeenCalled();
        });

        it('enqueues a new request, if an existing Run was found but is not available', async () => {
            const client = generateApifyClient('test-client');
            client.startScheduler();
            const taskClient = client.task('test-task-id');

            // Add an existing run to the tracker with FAILED status so it won't be reused
            const existingRun = getMockRun('existing-run-id', 'FAILED');
            context.runTracker.updateRun('test-run', existingRun);

            const newRun = getMockRun('new-run-id', 'READY');
            const startSpy = vi.spyOn(TaskClient.prototype, 'start').mockImplementation(async () => {
                return newRun;
            });

            const runInput = { testInput: 'value' };
            const startPromise = taskClient.start(runInput, { runName: 'test-run' });
            vi.advanceTimersByTime(MAIN_LOOP_COOLDOWN_MS);
            await vi.waitUntil(() => !client.isSchedulerLocked, 2_000);
            const result = await startPromise;

            expect(startSpy).toHaveBeenCalledWith(runInput, {});
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
            const startPromise = taskClient.start(runInput, { runName: 'test-run' });
            vi.advanceTimersByTime(MAIN_LOOP_COOLDOWN_MS);
            await vi.waitUntil(() => !client.isSchedulerLocked, 2_000);
            const result = await startPromise;

            expect(startSpy).toHaveBeenCalledWith(runInput, {});
            expect(result).toEqual(newRun);
        });

        it('enqueues a new request with the fixed input, if defined', async () => {
            options.fixedInput = { testKey: 'testValue' };
            const client = generateApifyClient('test-client');
            client.startScheduler();
            const taskClient = client.task('test-task-id');

            const startSpy = vi.spyOn(TaskClient.prototype, 'start').mockImplementation(async () => {
                return getMockRun('test-id');
            });

            const runInput = { runTestKey: 'runTestValue' };
            const startPromise = taskClient.start(runInput, { runName: 'test-run' });
            vi.advanceTimersByTime(MAIN_LOOP_COOLDOWN_MS);
            await vi.waitUntil(() => !client.isSchedulerLocked, 2_000);
            await startPromise;
            expect(startSpy).toHaveBeenCalledWith({ ...options.fixedInput, ...runInput }, {});
        });
    });

    describe('call', () => {
        it('waits for an existing Run, if already available', async () => {
            const client = generateApifyClient('test-client');
            const taskClient = client.task('test-task-id');

            // Add an existing run to the tracker
            const existingRun = getMockRun('existing-run-id', 'RUNNING');
            context.runTracker.updateRun('test-run', existingRun);

            // Mock the RunClient.get method to return the existing run
            vi.spyOn(ExtRunClient.prototype, 'get').mockImplementation(async () => {
                return existingRun;
            });

            // Mock waitForFinish to return finished run
            const finishedRun = getMockRun('existing-run-id', 'SUCCEEDED');
            const waitForFinishSpy = vi.spyOn(ExtRunClient.prototype, 'waitForFinish').mockImplementation(async () => {
                return finishedRun;
            });

            const result = await taskClient.call({ testInput: 'value' }, { runName: 'test-run' });

            expect(result).toEqual(finishedRun);
            expect(waitForFinishSpy).toHaveBeenCalledWith({ waitSecs: undefined });
        });

        it('starts a new Run and waits for it, if an existing Run was found but not available', async () => {
            const client = generateApifyClient('test-client');
            client.startScheduler();
            const taskClient = client.task('test-task-id');

            // Add an existing run to the tracker with FAILED status so it won't be reused
            const existingRun = getMockRun('existing-run-id', 'FAILED');
            context.runTracker.updateRun('test-run', existingRun);

            const newRun = getMockRun('new-run-id', 'READY');
            vi.spyOn(TaskClient.prototype, 'start').mockImplementation(async () => {
                return newRun;
            });

            // Mock waitForFinish to return finished run
            const finishedRun = getMockRun('new-run-id', 'SUCCEEDED');
            const waitForFinishSpy = vi.spyOn(ExtRunClient.prototype, 'waitForFinish').mockImplementation(async () => {
                return finishedRun;
            });

            const runInput = { testInput: 'value' };
            const callPromise = taskClient.call(runInput, { runName: 'test-run' });
            vi.advanceTimersByTime(MAIN_LOOP_COOLDOWN_MS);
            await vi.waitUntil(() => !client.isSchedulerLocked, 2_000);
            const result = await callPromise;

            expect(result).toEqual(finishedRun);
            expect(waitForFinishSpy).toHaveBeenCalledWith({ waitSecs: undefined });
        });

        it('starts a new Run and waits for it, if an existing Run was not found', async () => {
            const client = generateApifyClient('test-client');
            client.startScheduler();
            const taskClient = client.task('test-task-id');

            const newRun = getMockRun('new-run-id', 'READY');
            vi.spyOn(TaskClient.prototype, 'start').mockImplementation(async () => {
                return newRun;
            });

            // Mock waitForFinish to return finished run
            const finishedRun = getMockRun('new-run-id', 'SUCCEEDED');
            const waitForFinishSpy = vi.spyOn(ExtRunClient.prototype, 'waitForFinish').mockImplementation(async () => {
                return finishedRun;
            });

            const runInput = { testInput: 'value' };
            const callPromise = taskClient.call(runInput, { runName: 'test-run' });
            vi.advanceTimersByTime(MAIN_LOOP_COOLDOWN_MS);
            await vi.waitUntil(() => !client.isSchedulerLocked, 2_000);
            const result = await callPromise;

            expect(result).toEqual(finishedRun);
            expect(waitForFinishSpy).toHaveBeenCalledWith({ waitSecs: undefined });
        });
    });

    describe('lastRun', () => {
        it('returns a TrackedRunClient if the Run ID is found in the tracker', async () => {
            const client = generateApifyClient('test-client');
            const taskClient = client.task('test-task-id');

            // Add a run to the tracker
            const trackedRun = getMockRun('tracked-run-id', 'SUCCEEDED');
            context.runTracker.updateRun('tracked-run', trackedRun);

            // Mock the superClient's lastRun method
            const mockRunClient = {
                id: 'tracked-run-id',
            } as RunClient;
            const lastRunSpy = vi.spyOn(TaskClient.prototype, 'lastRun').mockImplementation(() => {
                return mockRunClient;
            });

            const result = taskClient.lastRun();

            expect(lastRunSpy).toHaveBeenCalled();
            expect(result).toBeInstanceOf(ExtRunClient);
            expect((result as ExtRunClient).runName).toBe('tracked-run');
        });

        it('returns a regular RunClient if the Run was not tracked', () => {
            const client = generateApifyClient('test-client');
            const taskClient = client.task('test-task-id');

            // Mock the superClient's lastRun method to return a run not in tracker
            const mockRunClient = {
                id: 'untracked-run-id',
            } as RunClient;
            const lastRunSpy = vi.spyOn(TaskClient.prototype, 'lastRun').mockImplementation(() => {
                return mockRunClient;
            });

            const result = taskClient.lastRun();

            expect(lastRunSpy).toHaveBeenCalled();
            expect(result).toBe(mockRunClient);
            expect(result).not.toBeInstanceOf(ExtRunClient);
        });
    });

    describe('enqueue', () => {
        it('enqueues a single Run request', () => {
            const client = generateApifyClient('test-client');
            client.startScheduler();
            const taskClient = client.task('test-task-id');

            const runRequests = [{ runName: 'test-run-1', input: { key: 'value1' } }];

            const result = taskClient.enqueue(...runRequests);

            expect(result).toEqual(['test-run-1']);
        });

        it('enqueues multiple Run requests', () => {
            const client = generateApifyClient('test-client');
            client.startScheduler();
            const taskClient = client.task('test-task-id');

            const runRequests = [
                { runName: 'test-run-1', input: { key: 'value1' } },
                { runName: 'test-run-2', input: { key: 'value2' } },
                { runName: 'test-run-3', input: { key: 'value3' } },
            ];

            const result = taskClient.enqueue(...runRequests);

            expect(result).toEqual(['test-run-1', 'test-run-2', 'test-run-3']);
        });
    });

    describe('startRuns', () => {
        it('starts multiple Runs', async () => {
            const client = generateApifyClient('test-client');
            const taskClient = client.task('test-task-id');

            // Mock the individual start method to return different runs immediately
            const run1 = getMockRun('run-1-id', 'READY');
            const run2 = getMockRun('run-2-id', 'READY');
            let callCount = 0;
            const startSpy = vi.spyOn(taskClient, 'start').mockImplementation(async (_runName) => {
                callCount++;
                return callCount === 1 ? run1 : run2;
            });

            const runRequests = [
                { runName: 'test-run-1', input: { key: 'value1' } },
                { runName: 'test-run-2', input: { key: 'value2' } },
            ];

            const result = await taskClient.startRuns(...runRequests);

            expect(startSpy).toHaveBeenCalledTimes(2);
            expect(startSpy).toHaveBeenCalledWith({ key: 'value1' }, { runName: 'test-run-1' });
            expect(startSpy).toHaveBeenCalledWith({ key: 'value2' }, { runName: 'test-run-2' });
            expect(result).toEqual({
                'test-run-1': run1,
                'test-run-2': run2,
            });
        });
    });

    describe('callRuns', () => {
        it('starts multiple Runs and waits for them to finish', async () => {
            const client = generateApifyClient('test-client');
            const taskClient = client.task('test-task-id');

            // Mock the individual call method to return different finished runs immediately
            const finishedRun1 = getMockRun('run-1-id', 'SUCCEEDED');
            const finishedRun2 = getMockRun('run-2-id', 'SUCCEEDED');
            let callCount = 0;
            const callSpy = vi.spyOn(taskClient, 'call').mockImplementation(async (_runName) => {
                callCount++;
                return callCount === 1 ? finishedRun1 : finishedRun2;
            });

            const runRequests = [
                { runName: 'test-run-1', input: { key: 'value1' } },
                { runName: 'test-run-2', input: { key: 'value2' } },
            ];

            const result = await taskClient.callRuns(...runRequests);

            expect(callSpy).toHaveBeenCalledTimes(2);
            expect(callSpy).toHaveBeenCalledWith({ key: 'value1' }, { runName: 'test-run-1' });
            expect(callSpy).toHaveBeenCalledWith({ key: 'value2' }, { runName: 'test-run-2' });
            expect(result).toEqual({
                'test-run-1': finishedRun1,
                'test-run-2': finishedRun2,
            });
        });
    });
});
