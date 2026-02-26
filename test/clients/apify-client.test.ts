import { RunClient } from 'apify-client';
import { ExtActorClient } from 'src/clients/actor-client.js';
import { ExtApifyClient } from 'src/clients/apify-client.js';
import { ExtDatasetClient } from 'src/clients/dataset-client.js';
import { ExtRunClient } from 'src/clients/run-client.js';
import type { ClientContext } from 'src/context/client-context.js';
import { RunSource } from 'src/entities/run-source.js';
import { getClientContext } from 'test/_helpers/context.js';
import { createActorRunMock } from 'test/_helpers/mocks.js';

vi.mock('src/utils/apify-client.js', async (importActual) => {
    return {
        ...(await importActual()),
        parseStartRunError: vi.fn(),
    };
});

describe('ExtApifyClient', () => {
    const startRun = vi.fn();
    const defaultMemoryMbytes = vi.fn();
    const runSource = new RunSource(startRun, defaultMemoryMbytes);

    const mockDate = new Date('2024-09-11T06:00:00.000Z');

    let context: ClientContext;
    let client: ExtApifyClient;

    beforeEach(() => {
        vi.useFakeTimers();
        context = getClientContext();
        client = new ExtApifyClient('test-client', context, {});
    });

    afterEach(() => {
        vi.resetAllMocks();
        vi.useRealTimers();
    });

    describe('actor', () => {
        it('generates an extended ActorClient', () => {
            const actorClient = client.actor('test-actor-id');
            expect(actorClient).toBeInstanceOf(ExtActorClient);
        });
    });

    describe('dataset', () => {
        it('generates an extended DatasetClient', () => {
            const datasetClient = client.dataset('test-dataset-id');
            expect(datasetClient).toBeInstanceOf(ExtDatasetClient);
        });
    });

    describe('run', () => {
        it('generates a regular RunClient if the run has not been tracked already', async () => {
            const runClient = client.run('test-id');
            expect(runClient).toBeInstanceOf(RunClient);
            expect(runClient).not.toBeInstanceOf(ExtRunClient);
        });

        it('generates an extended RunClient if a run with the same ID has been tracked', async () => {
            context.runTracker.updateRun('test-run', createActorRunMock({ id: 'test-id', status: 'READY' }));
            const runClient = client.run('test-id');
            expect(runClient).toBeInstanceOf(ExtRunClient);
        });
    });

    describe('runByName', () => {
        it('waits for a Run to start and then generates an extended RunClient', async () => {
            const run = createActorRunMock({ id: 'test-id', status: 'READY' });
            startRun.mockResolvedValue(run);
            context.runScheduler.requestRunStart({ name: 'test-run', source: runSource });
            expect(startRun).not.toHaveBeenCalled();
            const runClientPromise = client.runByName('test-run');
            await vi.advanceTimersByTimeAsync(1000);
            const runClient = await runClientPromise;
            expect(startRun).toHaveBeenCalledTimes(1);
            expect(runClient.id).toBe(run.id);
        });

        it('generates an extended RunClient if a Run with the specified name exists', async () => {
            context.runTracker.updateRun('test-run', createActorRunMock({ id: 'test-id', status: 'READY' }));
            const runClient = await client.runByName('test-run');
            expect(runClient).toBeInstanceOf(ExtRunClient);
        });

        it('returns undefined if a Run with the specified name does not exists', async () => {
            const runClient = await client.runByName('test-run');
            expect(runClient).toBe(undefined);
        });
    });

    describe('actorRunByName', () => {
        it('waits for a Run to start and then returns the ActorRun', async () => {
            const run = createActorRunMock({ id: 'test-id', status: 'READY' });
            startRun.mockResolvedValue(run);
            context.runScheduler.requestRunStart({ name: 'test-run', source: runSource });
            expect(startRun).not.toHaveBeenCalled();
            const foundRunPromise = client.actorRunByName('test-run');
            await vi.advanceTimersByTimeAsync(1000);
            const foundRun = await foundRunPromise;
            expect(startRun).toHaveBeenCalledTimes(1);
            expect(foundRun).toBe(run);
        });

        it('generates an ActorRun if a Run with the specified name exists', async () => {
            context.runTracker.updateRun('test-run', createActorRunMock({ id: 'test-id', status: 'READY' }));
            const getActorSpy = vi.spyOn(RunClient.prototype, 'get').mockImplementationOnce(async () => {
                return createActorRunMock({ id: 'test-id' });
            });
            const actorRun = await client.actorRunByName('test-run');
            expect(getActorSpy).toHaveBeenCalledTimes(1);
            expect(actorRun.id).toBe('test-id');
        });

        it('returns undefined if a Run with the specified name exists but the Run cannot be created', async () => {
            context.runTracker.updateRun('test-run', createActorRunMock({ id: 'test-id', status: 'READY' }));
            const getActorSpy = vi.spyOn(RunClient.prototype, 'get').mockImplementation(async () => {
                return undefined;
            });
            const actorRun = await client.actorRunByName('test-run');
            expect(getActorSpy).toHaveBeenCalledTimes(1);
            expect(actorRun).toBe(undefined);
        });

        it('returns undefined if a Run with the specified name does not exists', async () => {
            const getActorSpy = vi.spyOn(RunClient.prototype, 'get');
            const actorRun = await client.actorRunByName('test-run');
            expect(getActorSpy).not.toHaveBeenCalled();
            expect(actorRun).toBe(undefined);
        });
    });

    describe('runRecord', () => {
        it('generates a RunRecord with all the existing Runs when calling `runRecord`', async () => {
            const getActorSpy = vi.spyOn(RunClient.prototype, 'get');

            context.runTracker.updateRun(
                'test-run-1',
                createActorRunMock({ id: 'test-id-1', status: 'READY', startedAt: mockDate }),
            );
            context.runTracker.updateRun(
                'test-run-2',
                createActorRunMock({ id: 'test-id-2', status: 'READY', startedAt: mockDate }),
            );
            context.runTracker.updateRun(
                'test-run-3',
                createActorRunMock({ id: 'test-id-3', status: 'READY', startedAt: mockDate }),
            );

            getActorSpy
                .mockResolvedValueOnce(createActorRunMock({ id: 'test-id-1', status: 'READY', startedAt: mockDate }))
                .mockResolvedValueOnce(createActorRunMock({ id: 'test-id-2', status: 'READY', startedAt: mockDate }))
                .mockResolvedValueOnce(createActorRunMock({ id: 'test-id-3', status: 'READY', startedAt: mockDate }));

            expect(await client.runRecord('test-run-1', 'test-run-2', 'test-run-3')).toEqual({
                'test-run-1': createActorRunMock({ id: 'test-id-1', status: 'READY', startedAt: mockDate }),
                'test-run-2': createActorRunMock({ id: 'test-id-2', status: 'READY', startedAt: mockDate }),
                'test-run-3': createActorRunMock({ id: 'test-id-3', status: 'READY', startedAt: mockDate }),
            });
            expect(getActorSpy).toHaveBeenCalledTimes(3);

            context.runTracker.updateRun('test-run-2'); // track lost run by not providing a run object

            getActorSpy
                .mockResolvedValueOnce(createActorRunMock({ id: 'test-id-1', status: 'READY', startedAt: mockDate }))
                .mockResolvedValueOnce(createActorRunMock({ id: 'test-id-3', status: 'READY', startedAt: mockDate }));

            expect(await client.runRecord('test-run-1', 'test-run-2', 'test-run-3')).toEqual({
                'test-run-1': createActorRunMock({ id: 'test-id-1', status: 'READY', startedAt: mockDate }),
                'test-run-3': createActorRunMock({ id: 'test-id-3', status: 'READY', startedAt: mockDate }),
            });
            expect(getActorSpy).toHaveBeenCalledTimes(5);

            expect(await client.runRecord('test-run-4', 'test-run-5', 'test-run-6')).toEqual({});
        });
    });

    describe('waitForBatchFinish', () => {
        it('waits for all the Runs to finish when calling `waitForBatchFinish`', async () => {
            const mockRunIds = ['test-id-1', 'test-id-2', 'test-id-3'];
            let waitCounter = 0;
            const waitForFinishSpy = vi.spyOn(RunClient.prototype, 'waitForFinish').mockImplementation(async () => {
                const run = createActorRunMock({
                    id: mockRunIds[waitCounter],
                    status: 'SUCCEEDED',
                    startedAt: mockDate,
                });
                waitCounter++;
                if (waitCounter === mockRunIds.length) {
                    waitCounter = 0;
                }
                return run;
            });
            let getCounter = 0;
            const getActorSpy = vi.spyOn(RunClient.prototype, 'get').mockImplementation(async () => {
                const run = createActorRunMock({ id: mockRunIds[getCounter], status: 'READY', startedAt: mockDate });
                getCounter++;
                if (getCounter === mockRunIds.length) {
                    getCounter = 0;
                }
                return run;
            });

            const runRecord = await client.waitForBatchFinish({
                'test-run-1': createActorRunMock({ id: mockRunIds[0], status: 'READY', startedAt: mockDate }),
                'test-run-2': createActorRunMock({ id: mockRunIds[1], status: 'READY', startedAt: mockDate }),
                'test-run-3': createActorRunMock({ id: mockRunIds[2], status: 'READY', startedAt: mockDate }),
            });

            const expectedRunRecord = {
                'test-run-1': createActorRunMock({ id: mockRunIds[0], status: 'SUCCEEDED', startedAt: mockDate }),
                'test-run-2': createActorRunMock({ id: mockRunIds[1], status: 'SUCCEEDED', startedAt: mockDate }),
                'test-run-3': createActorRunMock({ id: mockRunIds[2], status: 'SUCCEEDED', startedAt: mockDate }),
            };

            expect(waitForFinishSpy).toHaveBeenCalledTimes(3);
            expect(runRecord).toEqual(expectedRunRecord);
            expect(context.runTracker.getCurrentRuns()).toEqual({
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
        it('aborts all tracked runs', async () => {
            const run1 = createActorRunMock({ id: 'run-1-id', status: 'RUNNING' });
            const run2 = createActorRunMock({ id: 'run-2-id', status: 'RUNNING' });

            context.runTracker.updateRun('test-run-1', run1);
            context.runTracker.updateRun('test-run-2', run2);

            const abortSpy = vi
                .spyOn(RunClient.prototype, 'abort')
                .mockResolvedValue(createActorRunMock({ status: 'ABORTED' }));

            await client.abortAllRuns();

            expect(abortSpy).toHaveBeenCalledTimes(2);
        });

        it('handles errors when aborting runs', async () => {
            const run1 = createActorRunMock({ id: 'run-1-id', status: 'RUNNING' });

            context.runTracker.updateRun('test-run-1', run1);

            const abortSpy = vi.spyOn(RunClient.prototype, 'abort').mockRejectedValue(new Error('Abort failed'));

            // Should not throw
            await expect(client.abortAllRuns()).resolves.not.toThrow();

            expect(abortSpy).toHaveBeenCalledTimes(1);
        });
    });

    describe('extendedRunClient', () => {
        it('creates an ExtRunClient instance', () => {
            const extRunClient = client.extendedRunClient('test-run', 'test-id');

            expect(extRunClient).toBeInstanceOf(ExtRunClient);
            expect(extRunClient.id).toBe('test-id');
        });
    });

    describe('findOrRequestRunStart', () => {
        it('waits for a Run that is already scheduled to start', async () => {
            const run = createActorRunMock({ id: 'test-id', status: 'RUNNING' });
            startRun.mockResolvedValue(run);

            context.runScheduler.requestRunStart({ name: 'test-run', source: runSource });

            const findOrRequestRunStart = client.findOrRequestRunStart({
                name: 'test-run',
                source: runSource,
            });
            const resultRunPromise = findOrRequestRunStart();
            await vi.advanceTimersByTimeAsync(1000);
            const resultRun = await resultRunPromise;

            expect(resultRun).toBe(run);
            expect(startRun).toHaveBeenCalledTimes(1);
        });

        it('returns existing Run if it is in OK status', async () => {
            const existingRun = createActorRunMock({ id: 'test-id', status: 'RUNNING' });
            context.runTracker.updateRun('test-run', existingRun);

            const getActorSpy = vi.spyOn(RunClient.prototype, 'get').mockResolvedValue(existingRun);

            const findOrRequestRunStart = client.findOrRequestRunStart({
                name: 'test-run',
                source: runSource,
            });
            const resultRun = await findOrRequestRunStart();

            expect(resultRun).toBe(existingRun);
            expect(getActorSpy).toHaveBeenCalledTimes(1);
            expect(startRun).not.toHaveBeenCalled();
        });

        it('starts a new Run if existing Run is not in OK status', async () => {
            const oldRun = createActorRunMock({ id: 'old-id', status: 'FAILED' });
            const newRun = createActorRunMock({ id: 'new-id', status: 'RUNNING' });

            context.runTracker.updateRun('test-run', oldRun);
            startRun.mockResolvedValue(newRun);

            const findOrRequestRunStart = client.findOrRequestRunStart({
                name: 'test-run',
                source: runSource,
            });
            const resultRunPromise = findOrRequestRunStart();
            await vi.advanceTimersByTimeAsync(1000);
            const resultRun = await resultRunPromise;

            expect(resultRun).toBe(newRun);
            expect(startRun).toHaveBeenCalledTimes(1);
        });

        it('starts a new Run if no existing Run is found', async () => {
            const newRun = createActorRunMock({ id: 'new-id', status: 'RUNNING' });
            startRun.mockResolvedValue(newRun);

            const findOrRequestRunStart = client.findOrRequestRunStart({
                name: 'test-run',
                source: runSource,
            });
            const resultRunPromise = findOrRequestRunStart();
            await vi.advanceTimersByTimeAsync(1000);
            const resultRun = await resultRunPromise;

            expect(resultRun).toBe(newRun);
            expect(startRun).toHaveBeenCalledTimes(1);
        });

        it('starts a new Run if existing Run object cannot be retrieved', async () => {
            const existingRun = createActorRunMock({ id: 'test-id', status: 'RUNNING' });
            const newRun = createActorRunMock({ id: 'new-id', status: 'RUNNING' });

            context.runTracker.updateRun('test-run', existingRun);
            startRun.mockResolvedValue(newRun);

            const getActorSpy = vi.spyOn(RunClient.prototype, 'get').mockResolvedValue(undefined);

            const findOrRequestRunStart = client.findOrRequestRunStart({
                name: 'test-run',
                source: runSource,
            });
            const resultRun = await findOrRequestRunStart();

            expect(resultRun).toBe(newRun);
            expect(getActorSpy).toHaveBeenCalledTimes(1);
            expect(startRun).toHaveBeenCalledTimes(1);
        });

        it('adds the fixed input when starting a new Run', async () => {
            const contextWithFixedInput = getClientContext({
                fixedInput: { propA: 'valueA', propB: 'valueB' },
            });
            const clientWithFixedInput = new ExtApifyClient('test-client', contextWithFixedInput, {});
            const newRun = createActorRunMock({ id: 'new-id', status: 'RUNNING' });
            startRun.mockResolvedValue(newRun);

            const findOrRequestRunStart = clientWithFixedInput.findOrRequestRunStart({
                name: 'test-run',
                source: runSource,
                input: { propB: 'overrideB', propC: 'valueC' },
            });
            const resultRunPromise = findOrRequestRunStart();
            await vi.advanceTimersByTimeAsync(1000);
            const resultRun = await resultRunPromise;

            expect(resultRun).toBe(newRun);
            expect(startRun).toHaveBeenCalledWith(
                {
                    propA: 'valueA',
                    propB: 'overrideB', // overrides fixed input
                    propC: 'valueC',
                },
                undefined,
            );
        });
    });
});
