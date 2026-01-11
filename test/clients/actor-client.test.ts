import type { RunClient } from 'apify-client';
import { ActorClient } from 'apify-client';
import type { ExtActorClient } from 'src/clients/actor-client.js';
import type { ExtApifyClient } from 'src/clients/apify-client.js';
import { ExtRunClient } from 'src/clients/run-client.js';
import type { RunSource } from 'src/entities/run-source.js';
import { getMockRun } from 'test/_helpers/mocks.js';
import { setupTestApifyClient } from 'test/_helpers/setup.js';

describe('ExtActorClient', () => {
    let apifyClient: ExtApifyClient;
    let actorClient: ExtActorClient;
    let runSource: RunSource;

    let actorGetSpy: ReturnType<typeof vi.spyOn>;
    let actorStartSpy: ReturnType<typeof vi.spyOn>;

    const mockRun = getMockRun();

    beforeEach(async () => {
        const setup = await setupTestApifyClient();

        apifyClient = setup.apifyClient;
        vi.spyOn(apifyClient, 'findOrStartRun').mockReturnValue(async () => mockRun);

        // We need to create these spies before creating the actorClient
        // to ensure that they are used in the client's constructor.
        actorGetSpy = vi.spyOn(ActorClient.prototype, 'get');
        actorStartSpy = vi.spyOn(ActorClient.prototype, 'start');

        actorClient = apifyClient.actor('test-actor-id');

        // eslint-disable-next-line dot-notation
        runSource = actorClient['runSource'];
    });

    afterEach(() => {
        vi.resetAllMocks();
    });

    describe('enqueue', () => {
        it('enqueues a single Run request', () => {
            const runRequests = [{ runName: 'test-run-1', input: { key: 'value1' } }];

            const result = actorClient.enqueue(...runRequests);

            expect(result).toEqual(['test-run-1']);
        });

        it('enqueues multiple Run requests', () => {
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
            const sources = ['item1', 'item2', 'item3'];
            const inputGenerator = (chunk: string[]) => ({ items: chunk });

            const result = actorClient.enqueueBatch('batch-test', sources, inputGenerator);

            // Verify it returns an array of run names
            expect(Array.isArray(result)).toBe(true);
            expect(result.length).toBeGreaterThan(0);
            expect(result.every((name) => typeof name === 'string')).toBe(true);
        });
    });

    describe('start', () => {
        it('starts a single Run', async () => {
            const result = await actorClient.start('test-run-1', { key: 'value1' });

            expect(apifyClient.findOrStartRun).toHaveBeenCalledWith(
                expect.objectContaining({
                    source: runSource,
                    name: 'test-run-1',
                    input: { key: 'value1' },
                    options: undefined,
                }),
            );
            expect(result).toBe(mockRun);
        });
    });

    describe('call', () => {
        it.only('starts a single Run and waits for it to finish', async () => {
            // Mock waitForFinish
            const finishedRunMock = getMockRun({ status: 'SUCCEEDED' });
            const waitForFinishSpy = vi
                .spyOn(ExtRunClient.prototype, 'waitForFinish')
                .mockImplementation(async () => finishedRunMock);

            const result = await actorClient.call('test-run-1', { key: 'value1' });

            expect(apifyClient.findOrStartRun).toHaveBeenCalledWith({
                source: runSource,
                name: 'test-run-1',
                input: { key: 'value1' },
                options: undefined,
            });
            expect(waitForFinishSpy).toHaveBeenCalled();
            expect(result).toBe(finishedRunMock);
        });
    });

    describe('lastRun', () => {
        it('generates a RunClient if the last Run has an ID', () => {
            const lastRunSpy = vi
                .spyOn(ActorClient.prototype, 'lastRun')
                .mockReturnValue({ id: 'last-run-id' } as RunClient);
            const mockRunClient = {} as RunClient;
            const runSpy = vi.spyOn(apifyClient, 'run').mockReturnValue(mockRunClient);

            const runClient = actorClient.lastRun();

            expect(lastRunSpy).toHaveBeenCalled();
            expect(runSpy).toHaveBeenCalledWith('last-run-id');
            expect(runClient).toBe(mockRunClient);
        });

        it('returns the RunClient from the base method if there is no last Run ID', () => {
            const mockRunClient = {} as RunClient;
            const lastRunSpy = vi.spyOn(ActorClient.prototype, 'lastRun').mockReturnValue(mockRunClient);
            const runSpy = vi.spyOn(apifyClient, 'run');

            const runClient = actorClient.lastRun();

            expect(lastRunSpy).toHaveBeenCalled();
            expect(runSpy).not.toHaveBeenCalled();
            expect(runClient).toBe(mockRunClient);
        });
    });

    describe('startRuns', () => {
        it('starts multiple Runs', async () => {
            // Mock the individual start method to return different runs immediately
            const run1 = getMockRun({ id: 'run-1-id', status: 'READY' });
            const run2 = getMockRun({ id: 'run-2-id', status: 'READY' });
            const startSpy = vi.spyOn(actorClient, 'start');
            startSpy.mockResolvedValueOnce(run1).mockResolvedValueOnce(run2);

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
            const sources = ['item1', 'item2'];
            const inputGenerator = (chunk: string[]) => ({ items: chunk });

            const result = await actorClient.startBatch('batch-test', sources, inputGenerator);

            expect(apifyClient.findOrStartRun).toHaveBeenCalled();
            expect(result).toEqual({
                'batch-test': mockRun,
            });
        });
    });

    describe('callRuns', () => {
        it('starts multiple Runs and waits for them to finish', async () => {
            // Mock the individual call method to return different finished runs immediately
            const finishedRun1 = getMockRun({ id: 'run-1-id', status: 'SUCCEEDED' });
            const finishedRun2 = getMockRun({ id: 'run-2-id', status: 'SUCCEEDED' });
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
            // Mock waitForFinish
            const finishedRun = getMockRun({ id: 'batch-run-id', status: 'SUCCEEDED' });
            const waitForFinishSpy = vi
                .spyOn(ExtRunClient.prototype, 'waitForFinish')
                .mockImplementation(async () => finishedRun);

            const sources = ['item1', 'item2'];
            const inputGenerator = (chunk: string[]) => ({ items: chunk });

            const result = await actorClient.callBatch('batch-test', sources, inputGenerator);

            expect(apifyClient.findOrStartRun).toHaveBeenCalled();
            expect(waitForFinishSpy).toHaveBeenCalled();
            expect(result).toEqual({
                'batch-test': finishedRun,
            });
        });
    });

    describe('runSource', () => {
        it('has the correct start method', async () => {
            actorStartSpy.mockResolvedValue(mockRun);

            const input = { key: 'value' };
            const options = { memory: 2048 };

            const result = await runSource.start(input, options);

            expect(actorStartSpy).toHaveBeenCalledWith(input, options);
            expect(result).toBe(mockRun);
        });

        it('correctly gets the default memory', async () => {
            actorGetSpy.mockResolvedValue({ defaultRunOptions: { memoryMbytes: 2048 } });

            // eslint-disable-next-line dot-notation
            const defaultMemory = await runSource['defaultMemoryMbytes']();

            expect(defaultMemory).toBe(2048);
        });
    });
});
