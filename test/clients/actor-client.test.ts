import type { ActorRun, RunClient } from 'apify-client';
import { ActorClient } from 'apify-client';
import { ExtApifyClient } from 'src/clients/apify-client.js';
import { ExtRunClient } from 'src/clients/run-client.js';
import { DEFAULT_ORCHESTRATOR_OPTIONS, MAIN_LOOP_COOLDOWN_MS } from 'src/constants.js';
import { RunsTracker } from 'src/tracker.js';
import type { OrchestratorOptions } from 'src/types.js';
import * as apifyApi from 'src/utils/apify-api.js';
import { CustomLogger } from 'src/utils/logging.js';

describe('actor-client methods', () => {
    let customLogger: CustomLogger;
    let runsTracker: RunsTracker;
    let options: OrchestratorOptions;

    const generateApifyClient = (clientName: string) =>
        new ExtApifyClient(
            clientName,
            customLogger,
            runsTracker,
            options.fixedInput,
            options.abortAllRunsOnGracefulAbort,
            options.hideSensitiveInformation,
        );

    const mockDate = new Date('2024-09-11T06:00:00.000Z');

    const getMockRun = (id: string, status = 'READY', defaultDatasetId = 'test-dataset-id') => {
        return {
            id,
            status,
            defaultDatasetId,
            startedAt: mockDate,
        } as ActorRun;
    };

    /**
     * Mocks the user limits API call.
     * Necessary for letting the scheduler to start new runs.
     */
    const mockUserLimits = () =>
        vi.spyOn(apifyApi, 'getUserLimits').mockImplementation(async () => ({
            currentMemoryUsageGBs: 1,
            maxMemoryGBs: 8,
            activeActorJobCount: 1,
            maxConcurrentActorJobs: 8,
        }));

    beforeEach(async () => {
        vi.useFakeTimers();
        customLogger = new CustomLogger(false, false);
        runsTracker = new RunsTracker(customLogger, false);
        await runsTracker.init();
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
            const actorClient = client.actor('test-actor-id');

            // Add an existing run to the tracker
            const existingRun = getMockRun('existing-run-id', 'RUNNING');
            await runsTracker.updateRun('test-run', existingRun);

            // Mock the RunClient.get method to return the existing run
            const getSpy = vi.spyOn(ExtRunClient.prototype, 'get').mockImplementation(async () => {
                return existingRun;
            });

            const result = await actorClient.start('test-run', { testInput: 'value' });

            expect(result).toEqual(existingRun);
            expect(getSpy).toHaveBeenCalled();
        });

        it('enqueues a new request, if an existing Run was found but not available', async () => {
            const client = generateApifyClient('test-client');
            client.startScheduler();
            const actorClient = client.actor('test-actor-id');

            // Add an existing run to the tracker with FAILED status so it won't be reused
            const existingRun = getMockRun('existing-run-id', 'FAILED');
            await runsTracker.updateRun('test-run', existingRun);

            mockUserLimits();

            const newRun = getMockRun('new-run-id', 'READY');
            const startSpy = vi.spyOn(ActorClient.prototype, 'start').mockImplementation(async () => {
                return newRun;
            });

            const runInput = { testInput: 'value' };
            const startPromise = actorClient.start('test-run', runInput);
            vi.advanceTimersByTime(MAIN_LOOP_COOLDOWN_MS);
            await vi.waitUntil(() => !client.isSchedulerLocked, 2_000);
            const result = await startPromise;

            expect(startSpy).toHaveBeenCalledWith(runInput, undefined);
            expect(result).toEqual(newRun);
        });

        it('enqueues a new request, if an existing Run was not found', async () => {
            const client = generateApifyClient('test-client');
            client.startScheduler();
            const actorClient = client.actor('test-actor-id');

            mockUserLimits();

            const newRun = getMockRun('new-run-id', 'READY');
            const startSpy = vi.spyOn(ActorClient.prototype, 'start').mockImplementation(async () => {
                return newRun;
            });

            const runInput = { testInput: 'value' };
            const startPromise = actorClient.start('test-run', runInput);
            vi.advanceTimersByTime(MAIN_LOOP_COOLDOWN_MS);
            await vi.waitUntil(() => !client.isSchedulerLocked, 2_000);
            const result = await startPromise;

            expect(startSpy).toHaveBeenCalledWith(runInput, undefined);
            expect(result).toEqual(newRun);
        });

        it('enqueues a new request with the fixed input, if defined', async () => {
            options.fixedInput = { testKey: 'testValue' };
            const client = generateApifyClient('test-client');
            client.startScheduler();
            const actorClient = client.actor('test-actor-id');

            mockUserLimits();

            const startSpy = vi.spyOn(ActorClient.prototype, 'start').mockImplementation(async () => {
                return getMockRun('test-id');
            });

            const runInput = { runTestKey: 'runTestValue' };
            const startPromise = actorClient.start('test-run', runInput);
            vi.advanceTimersByTime(MAIN_LOOP_COOLDOWN_MS);
            await vi.waitUntil(() => !client.isSchedulerLocked, 2_000);
            await startPromise;
            expect(startSpy).toHaveBeenCalledWith({ ...options.fixedInput, ...runInput }, undefined);
        });
    });

    describe('call', () => {
        it('waits for an existing Run, if already available', async () => {
            const client = generateApifyClient('test-client');
            const actorClient = client.actor('test-actor-id');

            // Add an existing run to the tracker
            const existingRun = getMockRun('existing-run-id', 'RUNNING');
            await runsTracker.updateRun('test-run', existingRun);

            // Mock the RunClient.get method to return the existing run
            vi.spyOn(ExtRunClient.prototype, 'get').mockImplementation(async () => {
                return existingRun;
            });

            // Mock waitForFinish to return finished run
            const finishedRun = getMockRun('existing-run-id', 'SUCCEEDED');
            const waitForFinishSpy = vi.spyOn(ExtRunClient.prototype, 'waitForFinish').mockImplementation(async () => {
                return finishedRun;
            });

            const result = await actorClient.call('test-run', { testInput: 'value' });

            expect(result).toEqual(finishedRun);
            expect(waitForFinishSpy).toHaveBeenCalledWith({ waitSecs: undefined });
        });

        it('starts a new Run and waits for it, if an existing Run was found but not available', async () => {
            const client = generateApifyClient('test-client');
            client.startScheduler();
            const actorClient = client.actor('test-actor-id');

            // Add an existing run to the tracker with FAILED status so it won't be reused
            const existingRun = getMockRun('existing-run-id', 'FAILED');
            await runsTracker.updateRun('test-run', existingRun);

            mockUserLimits();

            const newRun = getMockRun('new-run-id', 'READY');
            vi.spyOn(ActorClient.prototype, 'start').mockImplementation(async () => {
                return newRun;
            });

            // Mock waitForFinish to return finished run
            const finishedRun = getMockRun('new-run-id', 'SUCCEEDED');
            const waitForFinishSpy = vi.spyOn(ExtRunClient.prototype, 'waitForFinish').mockImplementation(async () => {
                return finishedRun;
            });

            const runInput = { testInput: 'value' };
            const callPromise = actorClient.call('test-run', runInput);
            vi.advanceTimersByTime(MAIN_LOOP_COOLDOWN_MS);
            await vi.waitUntil(() => !client.isSchedulerLocked, 2_000);
            const result = await callPromise;

            expect(result).toEqual(finishedRun);
            expect(waitForFinishSpy).toHaveBeenCalledWith({ waitSecs: undefined });
        });

        it('starts a new Run and waits for it, if an existing Run was not found', async () => {
            const client = generateApifyClient('test-client');
            client.startScheduler();
            const actorClient = client.actor('test-actor-id');

            mockUserLimits();

            const newRun = getMockRun('new-run-id', 'READY');
            vi.spyOn(ActorClient.prototype, 'start').mockImplementation(async () => {
                return newRun;
            });

            // Mock waitForFinish to return finished run
            const finishedRun = getMockRun('new-run-id', 'SUCCEEDED');
            const waitForFinishSpy = vi.spyOn(ExtRunClient.prototype, 'waitForFinish').mockImplementation(async () => {
                return finishedRun;
            });

            const runInput = { testInput: 'value' };
            const callPromise = actorClient.call('test-run', runInput);
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
            const actorClient = client.actor('test-actor-id');

            // Add a run to the tracker
            const trackedRun = getMockRun('tracked-run-id', 'SUCCEEDED');
            await runsTracker.updateRun('tracked-run', trackedRun);

            // Mock the superClient's lastRun method
            const mockRunClient = {
                id: 'tracked-run-id',
            } as RunClient;
            const lastRunSpy = vi.spyOn(ActorClient.prototype, 'lastRun').mockImplementation(() => {
                return mockRunClient;
            });

            const result = actorClient.lastRun();

            expect(lastRunSpy).toHaveBeenCalled();
            expect(result).toBeInstanceOf(ExtRunClient);
            expect((result as ExtRunClient).runName).toBe('tracked-run');
        });

        it('returns a regular RunClient if the Run was not tracked', () => {
            const client = generateApifyClient('test-client');
            const actorClient = client.actor('test-actor-id');

            // Mock the superClient's lastRun method to return a run not in tracker
            const mockRunClient = {
                id: 'untracked-run-id',
            } as RunClient;
            const lastRunSpy = vi.spyOn(ActorClient.prototype, 'lastRun').mockImplementation(() => {
                return mockRunClient;
            });

            const result = actorClient.lastRun();

            expect(lastRunSpy).toHaveBeenCalled();
            expect(result).toBe(mockRunClient);
            expect(result).not.toBeInstanceOf(ExtRunClient);
        });
    });

    describe('enqueue', () => {
        it('enqueues a single Run request', () => {
            const client = generateApifyClient('test-client');
            client.startScheduler();
            const actorClient = client.actor('test-actor-id');

            const runRequests = [{ runName: 'test-run-1', input: { key: 'value1' } }];

            const result = actorClient.enqueue(...runRequests);

            expect(result).toEqual(['test-run-1']);
        });

        it('enqueues multiple Run requests', () => {
            const client = generateApifyClient('test-client');
            client.startScheduler();
            const actorClient = client.actor('test-actor-id');

            const runRequests = [
                { runName: 'test-run-1', input: { key: 'value1' } },
                { runName: 'test-run-2', input: { key: 'value2' } },
                { runName: 'test-run-3', input: { key: 'value3' } },
            ];

            const result = actorClient.enqueue(...runRequests);

            expect(result).toEqual(['test-run-1', 'test-run-2', 'test-run-3']);
        });
    });

    describe('enqueueBatch', () => {
        it('splits the input according to the rules', () => {
            const client = generateApifyClient('test-client');
            client.startScheduler();
            const actorClient = client.actor('test-actor-id');

            const sources = ['item1', 'item2', 'item3'];
            const inputGenerator = (chunk: string[]) => ({ items: chunk });

            const result = actorClient.enqueueBatch('batch-test', sources, inputGenerator);

            // Verify it returns an array of run names
            expect(Array.isArray(result)).toBe(true);
            expect(result.length).toBeGreaterThan(0);
            expect(result.every((name) => typeof name === 'string')).toBe(true);
        });
    });

    describe('startRuns', () => {
        it('starts multiple Runs', async () => {
            const client = generateApifyClient('test-client');
            const actorClient = client.actor('test-actor-id');

            // Mock the individual start method to return different runs immediately
            const run1 = getMockRun('run-1-id', 'READY');
            const run2 = getMockRun('run-2-id', 'READY');
            let callCount = 0;
            const startSpy = vi.spyOn(actorClient, 'start').mockImplementation(async (_runName) => {
                callCount++;
                return callCount === 1 ? run1 : run2;
            });

            const runRequests = [
                { runName: 'test-run-1', input: { key: 'value1' } },
                { runName: 'test-run-2', input: { key: 'value2' } },
            ];

            const result = await actorClient.startRuns(...runRequests);

            expect(startSpy).toHaveBeenCalledTimes(2);
            expect(startSpy).toHaveBeenCalledWith('test-run-1', { key: 'value1' }, undefined);
            expect(startSpy).toHaveBeenCalledWith('test-run-2', { key: 'value2' }, undefined);
            expect(result).toEqual({
                'test-run-1': run1,
                'test-run-2': run2,
            });
        });
    });

    describe('startBatch', () => {
        it('splits the input and starts multiple Runs', async () => {
            const client = generateApifyClient('test-client');
            client.startScheduler();
            const actorClient = client.actor('test-actor-id');

            mockUserLimits();

            // Mock ActorClient.start
            const mockRun = getMockRun('batch-run-id', 'READY');
            const startSpy = vi.spyOn(ActorClient.prototype, 'start').mockImplementation(async () => mockRun);

            const sources = ['item1', 'item2'];
            const inputGenerator = (chunk: string[]) => ({ items: chunk });

            const startPromise = actorClient.startBatch('batch-test', sources, inputGenerator);
            vi.advanceTimersByTime(MAIN_LOOP_COOLDOWN_MS);
            await vi.waitUntil(() => !client.isSchedulerLocked, 2_000);
            const result = await startPromise;

            expect(startSpy).toHaveBeenCalled();
            expect(typeof result).toBe('object');
            expect(Object.keys(result).length).toBeGreaterThan(0);
        });
    });

    describe('callRuns', () => {
        it('starts multiple Runs and waits for them to finish', async () => {
            const client = generateApifyClient('test-client');
            const actorClient = client.actor('test-actor-id');

            // Mock the individual call method to return different finished runs immediately
            const finishedRun1 = getMockRun('run-1-id', 'SUCCEEDED');
            const finishedRun2 = getMockRun('run-2-id', 'SUCCEEDED');
            let callCount = 0;
            const callSpy = vi.spyOn(actorClient, 'call').mockImplementation(async (_runName) => {
                callCount++;
                return callCount === 1 ? finishedRun1 : finishedRun2;
            });

            const runRequests = [
                { runName: 'test-run-1', input: { key: 'value1' } },
                { runName: 'test-run-2', input: { key: 'value2' } },
            ];

            const result = await actorClient.callRuns(...runRequests);

            expect(callSpy).toHaveBeenCalledTimes(2);
            expect(callSpy).toHaveBeenCalledWith('test-run-1', { key: 'value1' }, undefined);
            expect(callSpy).toHaveBeenCalledWith('test-run-2', { key: 'value2' }, undefined);
            expect(result).toEqual({
                'test-run-1': finishedRun1,
                'test-run-2': finishedRun2,
            });
        });
    });

    describe('callBatch', () => {
        it('splits the input, starts multiple Runs and waits for them to finish', async () => {
            const client = generateApifyClient('test-client');
            client.startScheduler();
            const actorClient = client.actor('test-actor-id');

            mockUserLimits();

            // Mock ActorClient.start
            const mockRun = getMockRun('batch-run-id', 'READY');
            const startSpy = vi.spyOn(ActorClient.prototype, 'start').mockImplementation(async () => mockRun);

            // Mock waitForFinish
            const finishedRun = getMockRun('batch-run-id', 'SUCCEEDED');
            const waitForFinishSpy = vi
                .spyOn(ExtRunClient.prototype, 'waitForFinish')
                .mockImplementation(async () => finishedRun);

            const sources = ['item1', 'item2'];
            const inputGenerator = (chunk: string[]) => ({ items: chunk });

            const callPromise = actorClient.callBatch('batch-test', sources, inputGenerator);
            vi.advanceTimersByTime(MAIN_LOOP_COOLDOWN_MS);
            await vi.waitUntil(() => !client.isSchedulerLocked, 2_000);
            const result = await callPromise;

            expect(startSpy).toHaveBeenCalled();
            expect(waitForFinishSpy).toHaveBeenCalled();
            expect(typeof result).toBe('object');
            expect(Object.keys(result).length).toBeGreaterThan(0);
        });
    });
});
