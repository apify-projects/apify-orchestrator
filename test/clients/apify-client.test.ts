import type { ActorRun } from 'apify-client';
import { ActorClient, RunClient } from 'apify-client';
import { ExtActorClient } from 'src/clients/actor-client.js';
import { ExtApifyClient } from 'src/clients/apify-client.js';
import { ExtDatasetClient } from 'src/clients/dataset-client.js';
import { ExtRunClient } from 'src/clients/run-client.js';
import { DEFAULT_ORCHESTRATOR_OPTIONS, MAIN_LOOP_COOLDOWN_MS, MAIN_LOOP_INTERVAL_MS } from 'src/constants.js';
import { InsufficientMemoryError, type OrchestratorOptions } from 'src/index.js';
import { RunsTracker } from 'src/tracker.js';
import { parseStartRunError } from 'src/utils/apify-client.js';
import type { OrchestratorContext } from 'src/utils/context.js';
import { CustomLogger } from 'src/utils/logging.js';

vi.mock('src/utils/apify-client.js', async (importActual) => {
    return {
        ...(await importActual()),
        parseStartRunError: vi.fn(),
    };
});

describe('ExtApifyClient', () => {
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

    describe('actor', () => {
        it('generates an extended ActorClient', () => {
            const client = generateApifyClient('test-client');
            const actorClient = client.actor('test-actor-id');
            expect(actorClient).toBeInstanceOf(ExtActorClient);
        });
    });

    describe('dataset', () => {
        it('generates an extended DatasetClient', () => {
            const client = generateApifyClient('test-client');
            const datasetClient = client.dataset('test-dataset-id');
            expect(datasetClient).toBeInstanceOf(ExtDatasetClient);
        });
    });

    describe('run', () => {
        it('generates a regular RunClient if the run has not been tracked already', async () => {
            const client = generateApifyClient('test-client');
            const runClient = client.run('test-id');
            expect(runClient).toBeInstanceOf(RunClient);
            expect(runClient).not.toBeInstanceOf(ExtRunClient);
        });

        it('generates an extended RunClient if a run with the same ID has been tracked', async () => {
            await context.runsTracker.updateRun('test-run', getMockRun('test-id', 'READY'));
            const client = generateApifyClient('test-client');
            const runClient = client.run('test-id');
            expect(runClient).toBeInstanceOf(ExtRunClient);
        });
    });

    describe('startScheduler', () => {
        it('waits for a cooldown time if there is not enough available memory', async () => {
            const startSpy = vi.spyOn(ActorClient.prototype, 'start');
            startSpy.mockRejectedValueOnce(new Error('test-error'));
            vi.mocked(parseStartRunError).mockResolvedValue(new InsufficientMemoryError('test-run', 0));

            const client = generateApifyClient('test-client');
            client.startScheduler();

            client.actor('test').enqueue({ runName: 'test', options: { memory: 2_000 } });

            // Expect the scheduler not to have been executed because the time is still.
            expect(startSpy).not.toHaveBeenCalled();

            vi.advanceTimersByTime(MAIN_LOOP_INTERVAL_MS);
            await vi.waitFor(() => !client.isSchedulerLocked, 2_000);
            expect(startSpy).toHaveBeenCalledTimes(1);

            // Expect not to have called the API once more, because of the cooldown time.
            vi.advanceTimersByTime(MAIN_LOOP_INTERVAL_MS);
            await vi.waitUntil(() => !client.isSchedulerLocked, 2_000);
            expect(startSpy).toHaveBeenCalledTimes(1);

            startSpy.mockResolvedValueOnce(getMockRun('run-1', 'READY'));

            // Expect to call the API again after the cooldown
            for (let i = 0; i < MAIN_LOOP_COOLDOWN_MS; i += MAIN_LOOP_INTERVAL_MS) {
                vi.advanceTimersByTime(MAIN_LOOP_COOLDOWN_MS);
                await vi.waitUntil(() => !client.isSchedulerLocked, 2_000);
            }
            await vi.waitUntil(() => !client.isSchedulerLocked, 2_000);
            expect(startSpy).toHaveBeenCalledTimes(2);
        });
    });

    describe('stopScheduler', () => {
        it('stops the inner scheduler', async () => {
            const startSpy = vi.spyOn(ActorClient.prototype, 'start');

            const client = generateApifyClient('test-client');
            client.startScheduler();

            client.actor('test').enqueue({ runName: 'test' });
            expect(startSpy).not.toHaveBeenCalled();
            await client.stopScheduler();
            vi.advanceTimersByTime(MAIN_LOOP_INTERVAL_MS);
            expect(startSpy).not.toHaveBeenCalled();
        });
    });

    describe('runByName', () => {
        it('generates an extended RunClient if a Run with the specified name exists', async () => {
            await context.runsTracker.updateRun('test-run', getMockRun('test-id', 'READY'));
            const client = generateApifyClient('test-client');
            const runClient = await client.runByName('test-run');
            expect(runClient).toBeInstanceOf(ExtRunClient);
        });

        it('returns undefined if a Run with the specified name does not exists', async () => {
            const client = generateApifyClient('test-client');
            const runClient = await client.runByName('test-run');
            expect(runClient).toBe(undefined);
        });
    });

    describe('actorRunByName', () => {
        it('generates an ActorRun if a Run with the specified name exists', async () => {
            await context.runsTracker.updateRun('test-run', getMockRun('test-id', 'READY'));
            const client = generateApifyClient('test-client');
            const getActorSpy = vi.spyOn(RunClient.prototype, 'get').mockImplementationOnce(async () => {
                return getMockRun('test-id');
            });
            const actorRun = await client.actorRunByName('test-run');
            expect(getActorSpy).toHaveBeenCalledTimes(1);
            expect(actorRun.id).toBe('test-id');
        });

        it('returns undefined if a Run with the specified name exists but the Run cannot be created', async () => {
            await context.runsTracker.updateRun('test-run', getMockRun('test-id', 'READY'));
            const client = generateApifyClient('test-client');
            const getActorSpy = vi.spyOn(RunClient.prototype, 'get').mockImplementation(async () => {
                return undefined;
            });
            const actorRun = await client.actorRunByName('test-run');
            expect(getActorSpy).toHaveBeenCalledTimes(1);
            expect(actorRun).toBe(undefined);
        });

        it('returns undefined if a Run with the specified name does not exists', async () => {
            const client = generateApifyClient('test-client');
            const getActorSpy = vi.spyOn(RunClient.prototype, 'get');
            const actorRun = await client.actorRunByName('test-run');
            expect(getActorSpy).not.toHaveBeenCalled();
            expect(actorRun).toBe(undefined);
        });
    });

    describe('runRecord', () => {
        it('generates a RunRecord with all the existing Runs when calling `runRecord`', async () => {
            await context.runsTracker.updateRun('test-run-1', getMockRun('test-id-1', 'READY'));
            await context.runsTracker.updateRun('test-run-2', getMockRun('test-id-2', 'READY'));
            await context.runsTracker.updateRun('test-run-3', getMockRun('test-id-3', 'READY'));
            const client = generateApifyClient('test-client');

            let mockRunIds = ['test-id-1', 'test-id-2', 'test-id-3'];
            let getCounter = 0;
            const getActorSpy = vi.spyOn(RunClient.prototype, 'get').mockImplementation(async () => {
                const run = getMockRun(mockRunIds[getCounter], 'READY');
                getCounter++;
                if (getCounter === mockRunIds.length) {
                    getCounter = 0;
                }
                return run;
            });

            const runRecord = await client.runRecord('test-run-1', 'test-run-2', 'test-run-3');
            expect(getActorSpy).toHaveBeenCalledTimes(3);
            expect(runRecord).toEqual({
                'test-run-1': getMockRun('test-id-1', 'READY'),
                'test-run-2': getMockRun('test-id-2', 'READY'),
                'test-run-3': getMockRun('test-id-3', 'READY'),
            });

            await context.runsTracker.declareLostRun('test-run-2');
            mockRunIds = ['test-id-1', 'test-id-3'];
            expect(await client.runRecord('test-run-1', 'test-run-2', 'test-run-3')).toEqual({
                'test-run-1': getMockRun('test-id-1', 'READY'),
                'test-run-3': getMockRun('test-id-3', 'READY'),
            });

            expect(await client.runRecord('test-run-4', 'test-run-5', 'test-run-6')).toEqual({});
        });
    });

    describe('waitForBatchFinish', () => {
        it('waits for all the Runs to finish when calling `waitForBatchFinish`', async () => {
            const client = generateApifyClient('test-client');

            const mockRunIds = ['test-id-1', 'test-id-2', 'test-id-3'];
            let waitCounter = 0;
            const waitForFinishSpy = vi.spyOn(RunClient.prototype, 'waitForFinish').mockImplementation(async () => {
                const run = getMockRun(mockRunIds[waitCounter], 'SUCCEEDED');
                waitCounter++;
                if (waitCounter === mockRunIds.length) {
                    waitCounter = 0;
                }
                return run;
            });
            let getCounter = 0;
            const getActorSpy = vi.spyOn(RunClient.prototype, 'get').mockImplementation(async () => {
                const run = getMockRun(mockRunIds[getCounter], 'READY');
                getCounter++;
                if (getCounter === mockRunIds.length) {
                    getCounter = 0;
                }
                return run;
            });

            const runRecord = await client.waitForBatchFinish({
                'test-run-1': getMockRun(mockRunIds[0], 'READY'),
                'test-run-2': getMockRun(mockRunIds[1], 'READY'),
                'test-run-3': getMockRun(mockRunIds[2], 'READY'),
            });

            const expectedRunRecord = {
                'test-run-1': getMockRun(mockRunIds[0], 'SUCCEEDED'),
                'test-run-2': getMockRun(mockRunIds[1], 'SUCCEEDED'),
                'test-run-3': getMockRun(mockRunIds[2], 'SUCCEEDED'),
            };

            expect(waitForFinishSpy).toHaveBeenCalledTimes(3);
            expect(runRecord).toEqual(expectedRunRecord);
            expect(context.runsTracker.currentRuns).toEqual({
                'test-run-1': {
                    runId: 'test-id-1',
                    runUrl: 'https://console.apify.com/actors/runs/test-id-1',
                    status: 'SUCCEEDED',
                    startedAt: mockDate.toISOString(),
                },
                'test-run-2': {
                    runId: 'test-id-2',
                    runUrl: 'https://console.apify.com/actors/runs/test-id-2',
                    status: 'SUCCEEDED',
                    startedAt: mockDate.toISOString(),
                },
                'test-run-3': {
                    runId: 'test-id-3',
                    runUrl: 'https://console.apify.com/actors/runs/test-id-3',
                    status: 'SUCCEEDED',
                    startedAt: mockDate.toISOString(),
                },
            });

            await client.waitForBatchFinish(['test-run-1', 'test-run-2', 'test-run-3']);

            expect(getActorSpy).toHaveBeenCalledTimes(3);
            expect(waitForFinishSpy).toHaveBeenCalledTimes(6);
            expect(runRecord).toEqual(expectedRunRecord);
        });
    });

    describe('abortAllRuns', () => {
        it('calls the abort function for each Run in progress when calling `abortAllRuns`', async () => {
            await context.runsTracker.updateRun('test-run-1', getMockRun('test-id-1', 'READY'));
            await context.runsTracker.updateRun('test-run-2', getMockRun('test-id-2', 'READY'));
            await context.runsTracker.updateRun('test-run-3', getMockRun('test-id-3', 'READY'));
            const client = generateApifyClient('test-client');

            const mockRunIds = ['test-id-1', 'test-id-2', 'test-id-3'];
            let abortCounter = 0;
            const abortActorSpy = vi.spyOn(RunClient.prototype, 'abort').mockImplementation(async () => {
                const run = getMockRun(mockRunIds[abortCounter], 'ABORTED');
                abortCounter++;
                if (abortCounter === mockRunIds.length) {
                    abortCounter = 0;
                }
                return run;
            });

            await client.abortAllRuns();

            expect(abortActorSpy).toHaveBeenCalledTimes(3);
        });
    });
});
