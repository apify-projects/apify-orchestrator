import { ActorRun, ApifyClient, DatasetClient, PaginatedList, RunClient } from 'apify-client';
import { ExtActorClient } from 'src/clients/actor-client.js';
import { ExtApifyClient } from 'src/clients/apify-client.js';
import { ExtDatasetClient } from 'src/clients/dataset-client.js';
import { ExtRunClient } from 'src/clients/run-client.js';
import { DEFAULT_ORCHESTRATOR_OPTIONS, MAIN_LOOP_INTERVAL_MS } from 'src/constants.js';
import { OrchestratorOptions } from 'src/index.js';
import { RunsTracker } from 'src/tracker.js';
import * as apifyApi from 'src/utils/apify-api.js';
import { CustomLogger } from 'src/utils/logging.js';

describe('apify-client', () => {
    let customLogger: CustomLogger;
    let runsTracker: RunsTracker;
    let options: OrchestratorOptions;

    const generateApifyClient = (clientName: string) => new ExtApifyClient(
        clientName,
        customLogger,
        runsTracker,
        options.fixedInput,
        options.statsIntervalSec,
        options.abortAllRunsOnGracefulAbort,
        options.hideSensibleInformation,
    );

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

    it('generates an extended ActorClient when calling `actor`', () => {
        const client = generateApifyClient('test-client');
        const actorClient = client.actor('test-actor-id');
        expect(actorClient).toBeInstanceOf(ExtActorClient);
    });

    it('generates an extended DatasetClient when calling `dataset`', () => {
        const client = generateApifyClient('test-client');
        const datasetClient = client.dataset('test-dataset-id');
        expect(datasetClient).toBeInstanceOf(ExtDatasetClient);
    });

    it('generates a regular RunClient when calling `run` if the run has not been tracked already', async () => {
        const client = generateApifyClient('test-client');
        const runClient = client.run('test-id');
        expect(runClient).toBeInstanceOf(RunClient);
        expect(runClient).not.toBeInstanceOf(ExtRunClient);
    });

    it('generates an extended RunClient when calling `run` if a run with the same ID has been tracked', async () => {
        await runsTracker.updateRun('test-run', { id: 'test-id', status: 'READY' } as ActorRun);
        const client = generateApifyClient('test-client');
        const runClient = client.run('test-id');
        expect(runClient).toBeInstanceOf(ExtRunClient);
    });

    it('starts the scheduler with `startScheduler` and checks for available memory if the queue is non empty', async () => {
        const client = generateApifyClient('test-client');
        await client.startScheduler();
        const getAvailableMemorySpy = vi.spyOn(apifyApi, 'getAvailableMemoryGBs')
            .mockImplementation(async () => {
                return 0;
            });
        client.actor('test').enqueue({ runName: 'test' });
        expect(getAvailableMemorySpy).not.toHaveBeenCalled();
        vi.advanceTimersByTime(MAIN_LOOP_INTERVAL_MS);
        expect(getAvailableMemorySpy).toHaveBeenCalledTimes(1);
    });

    it('stops the scheduler with `stopScheduler`', async () => {
        const client = generateApifyClient('test-client');
        await client.startScheduler();
        const getAvailableMemorySpy = vi.spyOn(apifyApi, 'getAvailableMemoryGBs')
            .mockImplementation(async () => {
                return 0;
            });
        client.actor('test').enqueue({ runName: 'test' });
        expect(getAvailableMemorySpy).not.toHaveBeenCalled();
        await client.stopScheduler();
        vi.advanceTimersByTime(MAIN_LOOP_INTERVAL_MS);
        expect(getAvailableMemorySpy).not.toHaveBeenCalled();
    });

    it('generates an extended RunClient when calling `runByName` if a run with the specified name exists', async () => {
        await runsTracker.updateRun('test-run', { id: 'test-id', status: 'READY' } as ActorRun);
        const client = generateApifyClient('test-client');
        const runClient = await client.runByName('test-run');
        expect(runClient).toBeInstanceOf(ExtRunClient);
    });

    it('returns undefined when calling `runByName` if a run with the specified name does not exists', async () => {
        const client = generateApifyClient('test-client');
        const runClient = await client.runByName('test-run');
        expect(runClient).toBe(undefined);
    });

    it('generates an ActorRun when calling `actorRunByName` if a run with the specified name exists', async () => {
        await runsTracker.updateRun('test-run', { id: 'test-id', status: 'READY' } as ActorRun);
        const client = generateApifyClient('test-client');
        const getActorSpy = vi.spyOn(RunClient.prototype, 'get')
            .mockImplementationOnce(async () => {
                return { id: 'test-id' } as ActorRun;
            });
        const actorRun = await client.actorRunByName('test-run');
        expect(getActorSpy).toHaveBeenCalledTimes(1);
        expect(actorRun.id).toBe('test-id');
    });

    it('returns undefined when calling `actorRunByName` if a run with the specified name exists but the Run cannot be created', async () => {
        await runsTracker.updateRun('test-run', { id: 'test-id', status: 'READY' } as ActorRun);
        const client = generateApifyClient('test-client');
        const getActorSpy = vi.spyOn(RunClient.prototype, 'get')
            .mockImplementation(async () => {
                return undefined;
            });
        const actorRun = await client.actorRunByName('test-run');
        expect(getActorSpy).toHaveBeenCalledTimes(1);
        expect(actorRun).toBe(undefined);
    });

    it('returns undefined when calling `actorRunByName` if a run with the specified name does not exists', async () => {
        const client = generateApifyClient('test-client');
        const getActorSpy = vi.spyOn(RunClient.prototype, 'get');
        const actorRun = await client.actorRunByName('test-run');
        expect(getActorSpy).not.toHaveBeenCalled();
        expect(actorRun).toBe(undefined);
    });

    it('generates a RunRecord with all the existing runs when calling `runRecord`', async () => {
        await runsTracker.updateRun('test-run-1', { id: 'test-id-1', status: 'READY' } as ActorRun);
        await runsTracker.updateRun('test-run-2', { id: 'test-id-2', status: 'READY' } as ActorRun);
        await runsTracker.updateRun('test-run-3', { id: 'test-id-3', status: 'READY' } as ActorRun);
        const client = generateApifyClient('test-client');

        let mockRunIds = [
            'test-id-1',
            'test-id-2',
            'test-id-3',
        ];
        let getCounter = 0;
        const getActorSpy = vi.spyOn(RunClient.prototype, 'get')
            .mockImplementation(async () => {
                const run = { id: mockRunIds[getCounter], status: 'READY' } as ActorRun;
                getCounter++;
                if (getCounter === mockRunIds.length) { getCounter = 0; }
                return run;
            });

        const runRecord = await client.runRecord(
            'test-run-1',
            'test-run-2',
            'test-run-3',
        );
        expect(getActorSpy).toHaveBeenCalledTimes(3);
        expect(runRecord).toEqual({
            'test-run-1': { id: 'test-id-1', status: 'READY' },
            'test-run-2': { id: 'test-id-2', status: 'READY' },
            'test-run-3': { id: 'test-id-3', status: 'READY' },
        });

        await runsTracker.declareLostRun('test-run-2');
        mockRunIds = [
            'test-id-1',
            'test-id-3',
        ];
        expect(await client.runRecord(
            'test-run-1',
            'test-run-2',
            'test-run-3',
        )).toEqual({
            'test-run-1': { id: 'test-id-1', status: 'READY' },
            'test-run-3': { id: 'test-id-3', status: 'READY' },
        });

        expect(await client.runRecord(
            'test-run-4',
            'test-run-5',
            'test-run-6',
        )).toEqual({});
    });

    it('waits for all the runs to finish when calling `waitForBatchFinish`', async () => {
        const client = generateApifyClient('test-client');

        const mockRunIds = [
            'test-id-1',
            'test-id-2',
            'test-id-3',
        ];
        let waitCounter = 0;
        const waitForFinishSpy = vi.spyOn(RunClient.prototype, 'waitForFinish')
            .mockImplementation(async () => {
                const run = { id: mockRunIds[waitCounter], status: 'SUCCEEDED' } as ActorRun;
                waitCounter++;
                if (waitCounter === mockRunIds.length) { waitCounter = 0; }
                return run;
            });
        let getCounter = 0;
        const getActorSpy = vi.spyOn(RunClient.prototype, 'get')
            .mockImplementation(async () => {
                const run = { id: mockRunIds[getCounter], status: 'READY' } as ActorRun;
                getCounter++;
                if (getCounter === mockRunIds.length) { getCounter = 0; }
                return run;
            });

        const runRecord = await client.waitForBatchFinish({
            'test-run-1': { id: mockRunIds[0], status: 'READY' } as ActorRun,
            'test-run-2': { id: mockRunIds[1], status: 'READY' } as ActorRun,
            'test-run-3': { id: mockRunIds[2], status: 'READY' } as ActorRun,
        });

        const expectedRunRecord = {
            'test-run-1': { id: mockRunIds[0], status: 'SUCCEEDED' } as ActorRun,
            'test-run-2': { id: mockRunIds[1], status: 'SUCCEEDED' } as ActorRun,
            'test-run-3': { id: mockRunIds[2], status: 'SUCCEEDED' } as ActorRun,
        };

        expect(waitForFinishSpy).toHaveBeenCalledTimes(3);
        expect(runRecord).toEqual(expectedRunRecord);
        expect(runsTracker.currentRuns).toEqual({
            'test-run-1': {
                runId: 'test-id-1',
                runUrl: 'https://console.apify.com/actors/runs/test-id-1',
                status: 'SUCCEEDED',
            },
            'test-run-2': {
                runId: 'test-id-2',
                runUrl: 'https://console.apify.com/actors/runs/test-id-2',
                status: 'SUCCEEDED',
            },
            'test-run-3': {
                runId: 'test-id-3',
                runUrl: 'https://console.apify.com/actors/runs/test-id-3',
                status: 'SUCCEEDED',
            },
        });

        await client.waitForBatchFinish([
            'test-run-1',
            'test-run-2',
            'test-run-3',
        ]);

        expect(getActorSpy).toHaveBeenCalledTimes(3);
        expect(waitForFinishSpy).toHaveBeenCalledTimes(6);
        expect(runRecord).toEqual(expectedRunRecord);
    });

    it('abortAllRuns', async () => {
        await runsTracker.updateRun('test-run-1', { id: 'test-id-1', status: 'READY' } as ActorRun);
        await runsTracker.updateRun('test-run-2', { id: 'test-id-2', status: 'READY' } as ActorRun);
        await runsTracker.updateRun('test-run-3', { id: 'test-id-3', status: 'READY' } as ActorRun);
        const client = generateApifyClient('test-client');

        const mockRunIds = [
            'test-id-1',
            'test-id-2',
            'test-id-3',
        ];
        let abortCounter = 0;
        const abortActorSpy = vi.spyOn(RunClient.prototype, 'abort')
            .mockImplementation(async () => {
                const run = { id: mockRunIds[abortCounter], status: 'ABORTED' } as ActorRun;
                abortCounter++;
                if (abortCounter === mockRunIds.length) { abortCounter = 0; }
                return run;
            });

        await client.abortAllRuns();

        expect(abortActorSpy).toHaveBeenCalledTimes(3);
    });

    it('iterates dataset items when calling `iterateOutput` with a single run', async () => {
        type Item = { id: number }
        const paginatedItems: Item[][] = [
            [{ id: 1 }, { id: 2 }, { id: 3 }],
            [{ id: 4 }, { id: 5 }],
            [],
        ];
        let listCounter = 0;

        const createDatasetSpy = vi.spyOn(ApifyClient.prototype, 'dataset');
        const listItemsSpy = vi.spyOn(DatasetClient.prototype, 'listItems')
            .mockImplementation(async () => {
                const paginatedList = paginatedItems[listCounter];
                listCounter++;
                return {
                    items: paginatedList,
                } as PaginatedList<Item>;
            });

        const client = generateApifyClient('test-client');

        const results: Item[] = [];
        const datasetIterator = client.iterateOutput<Item>(
            { id: 'test-id', status: 'SUCCEEDED', defaultDatasetId: 'test-dataset-id' } as ActorRun,
            { pageSize: 3 },
        );

        for await (const item of datasetIterator) {
            results.push(item);
        }

        expect(createDatasetSpy).toHaveBeenCalledTimes(1);
        expect(createDatasetSpy).toHaveBeenCalledWith('test-dataset-id');

        expect(listItemsSpy).toHaveBeenCalledTimes(3);
        expect(listItemsSpy).toHaveBeenNthCalledWith(1, { offset: 0, limit: 3 });
        expect(listItemsSpy).toHaveBeenNthCalledWith(2, { offset: 3, limit: 3 });
        expect(listItemsSpy).toHaveBeenNthCalledWith(3, { offset: 6, limit: 3 });
        expect(results).toEqual(paginatedItems.flat());
    });

    it('iterates many datasets when calling `iterateOutput` with a RunRecord', async () => {
        type Item = { id: number }
        const paginatedItems: Item[][] = [
            [{ id: 1 }, { id: 2 }, { id: 3 }],
            [],
            [{ id: 4 }, { id: 5 }],
            [],
            [],
        ];
        let listCounter = 0;

        const createDatasetSpy = vi.spyOn(ApifyClient.prototype, 'dataset');
        const listItemsSpy = vi.spyOn(DatasetClient.prototype, 'listItems')
            .mockImplementation(async () => {
                const paginatedList = paginatedItems[listCounter];
                listCounter++;
                return {
                    items: paginatedList,
                } as PaginatedList<Item>;
            });

        const client = generateApifyClient('test-client');

        const results: Item[] = [];
        const datasetIterator = client.iterateOutput<Item>(
            {
                'test-run-1': { id: 'test-id-1', status: 'SUCCEEDED', defaultDatasetId: 'test-dataset-id-1' } as ActorRun,
                'test-run-2': { id: 'test-id-2', status: 'TIMED-OUT', defaultDatasetId: 'test-dataset-id-2' } as ActorRun,
                'test-run-3': { id: 'test-id-3', status: 'ABORTED', defaultDatasetId: 'test-dataset-id-3' } as ActorRun,
            },
            { pageSize: 3 },
        );

        for await (const item of datasetIterator) {
            results.push(item);
        }

        expect(createDatasetSpy).toHaveBeenCalledTimes(3);
        expect(createDatasetSpy).toHaveBeenNthCalledWith(1, 'test-dataset-id-1');
        expect(createDatasetSpy).toHaveBeenNthCalledWith(2, 'test-dataset-id-2');
        expect(createDatasetSpy).toHaveBeenNthCalledWith(3, 'test-dataset-id-3');

        expect(listItemsSpy).toHaveBeenCalledTimes(5);
        expect(listItemsSpy).toHaveBeenNthCalledWith(1, { offset: 0, limit: 3 });
        expect(listItemsSpy).toHaveBeenNthCalledWith(2, { offset: 3, limit: 3 });
        expect(listItemsSpy).toHaveBeenNthCalledWith(3, { offset: 0, limit: 3 });
        expect(listItemsSpy).toHaveBeenNthCalledWith(4, { offset: 3, limit: 3 });
        expect(listItemsSpy).toHaveBeenNthCalledWith(5, { offset: 0, limit: 3 });
        expect(results).toEqual(paginatedItems.flat());
    });
});
