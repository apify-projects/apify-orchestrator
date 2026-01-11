import { RunClient } from 'apify-client';
import { ExtActorClient } from 'src/clients/actor-client.js';
import type { ExtApifyClient } from 'src/clients/apify-client.js';
import { ExtDatasetClient } from 'src/clients/dataset-client.js';
import { ExtRunClient } from 'src/clients/run-client.js';
import type { RunTracker } from 'src/run-tracker.js';
import { getMockRun } from 'test/_helpers/mocks.js';
import { setupTestApifyClient } from 'test/_helpers/setup.js';

vi.mock('src/utils/apify-client.js', async (importActual) => {
    return {
        ...(await importActual()),
        parseStartRunError: vi.fn(),
    };
});

describe('ExtApifyClient', () => {
    let runTracker: RunTracker;
    let client: ExtApifyClient;

    const mockDate = new Date('2024-09-11T06:00:00.000Z');

    beforeEach(async () => {
        const setup = await setupTestApifyClient();
        runTracker = setup.runTracker;
        client = setup.apifyClient;
    });

    afterEach(() => {
        vi.resetAllMocks();
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
            runTracker.updateRun('test-run', getMockRun({ id: 'test-id', status: 'READY' }));
            const runClient = client.run('test-id');
            expect(runClient).toBeInstanceOf(ExtRunClient);
        });
    });

    describe('runByName', () => {
        it('generates an extended RunClient if a Run with the specified name exists', async () => {
            runTracker.updateRun('test-run', getMockRun({ id: 'test-id', status: 'READY' }));
            const runClient = await client.runByName('test-run');
            expect(runClient).toBeInstanceOf(ExtRunClient);
        });

        it('returns undefined if a Run with the specified name does not exists', async () => {
            const runClient = await client.runByName('test-run');
            expect(runClient).toBe(undefined);
        });
    });

    describe('actorRunByName', () => {
        it('generates an ActorRun if a Run with the specified name exists', async () => {
            runTracker.updateRun('test-run', getMockRun({ id: 'test-id', status: 'READY' }));
            const getActorSpy = vi.spyOn(RunClient.prototype, 'get').mockImplementationOnce(async () => {
                return getMockRun({ id: 'test-id' });
            });
            const actorRun = await client.actorRunByName('test-run');
            expect(getActorSpy).toHaveBeenCalledTimes(1);
            expect(actorRun.id).toBe('test-id');
        });

        it('returns undefined if a Run with the specified name exists but the Run cannot be created', async () => {
            runTracker.updateRun('test-run', getMockRun({ id: 'test-id', status: 'READY' }));
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

            runTracker.updateRun('test-run-1', getMockRun({ id: 'test-id-1', status: 'READY', startedAt: mockDate }));
            runTracker.updateRun('test-run-2', getMockRun({ id: 'test-id-2', status: 'READY', startedAt: mockDate }));
            runTracker.updateRun('test-run-3', getMockRun({ id: 'test-id-3', status: 'READY', startedAt: mockDate }));

            getActorSpy
                .mockResolvedValueOnce(getMockRun({ id: 'test-id-1', status: 'READY', startedAt: mockDate }))
                .mockResolvedValueOnce(getMockRun({ id: 'test-id-2', status: 'READY', startedAt: mockDate }))
                .mockResolvedValueOnce(getMockRun({ id: 'test-id-3', status: 'READY', startedAt: mockDate }));

            expect(await client.runRecord('test-run-1', 'test-run-2', 'test-run-3')).toEqual({
                'test-run-1': getMockRun({ id: 'test-id-1', status: 'READY', startedAt: mockDate }),
                'test-run-2': getMockRun({ id: 'test-id-2', status: 'READY', startedAt: mockDate }),
                'test-run-3': getMockRun({ id: 'test-id-3', status: 'READY', startedAt: mockDate }),
            });
            expect(getActorSpy).toHaveBeenCalledTimes(3);

            runTracker.declareLostRun('test-run-2');

            getActorSpy
                .mockResolvedValueOnce(getMockRun({ id: 'test-id-1', status: 'READY', startedAt: mockDate }))
                .mockResolvedValueOnce(getMockRun({ id: 'test-id-3', status: 'READY', startedAt: mockDate }));

            expect(await client.runRecord('test-run-1', 'test-run-2', 'test-run-3')).toEqual({
                'test-run-1': getMockRun({ id: 'test-id-1', status: 'READY', startedAt: mockDate }),
                'test-run-3': getMockRun({ id: 'test-id-3', status: 'READY', startedAt: mockDate }),
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
                const run = getMockRun({ id: mockRunIds[waitCounter], status: 'SUCCEEDED', startedAt: mockDate });
                waitCounter++;
                if (waitCounter === mockRunIds.length) {
                    waitCounter = 0;
                }
                return run;
            });
            let getCounter = 0;
            const getActorSpy = vi.spyOn(RunClient.prototype, 'get').mockImplementation(async () => {
                const run = getMockRun({ id: mockRunIds[getCounter], status: 'READY', startedAt: mockDate });
                getCounter++;
                if (getCounter === mockRunIds.length) {
                    getCounter = 0;
                }
                return run;
            });

            const runRecord = await client.waitForBatchFinish({
                'test-run-1': getMockRun({ id: mockRunIds[0], status: 'READY', startedAt: mockDate }),
                'test-run-2': getMockRun({ id: mockRunIds[1], status: 'READY', startedAt: mockDate }),
                'test-run-3': getMockRun({ id: mockRunIds[2], status: 'READY', startedAt: mockDate }),
            });

            const expectedRunRecord = {
                'test-run-1': getMockRun({ id: mockRunIds[0], status: 'SUCCEEDED', startedAt: mockDate }),
                'test-run-2': getMockRun({ id: mockRunIds[1], status: 'SUCCEEDED', startedAt: mockDate }),
                'test-run-3': getMockRun({ id: mockRunIds[2], status: 'SUCCEEDED', startedAt: mockDate }),
            };

            expect(waitForFinishSpy).toHaveBeenCalledTimes(3);
            expect(runRecord).toEqual(expectedRunRecord);
            expect(runTracker.getCurrentRuns()).toEqual({
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
            runTracker.updateRun('test-run-1', getMockRun({ id: 'test-id-1', status: 'READY' }));
            runTracker.updateRun('test-run-2', getMockRun({ id: 'test-id-2', status: 'READY' }));
            runTracker.updateRun('test-run-3', getMockRun({ id: 'test-id-3', status: 'READY' }));

            const mockRunIds = ['test-id-1', 'test-id-2', 'test-id-3'];
            let abortCounter = 0;
            const abortActorSpy = vi.spyOn(RunClient.prototype, 'abort').mockImplementation(async () => {
                const run = getMockRun({ id: mockRunIds[abortCounter], status: 'ABORTED' });
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
