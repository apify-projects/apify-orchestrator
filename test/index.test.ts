import { MAIN_LOOP_INTERVAL_MS } from 'src/constants.js';
import { DatasetItem, Orchestrator } from 'src/index.js';
import * as apifyApi from 'src/utils/apify-api.js';

describe('Apify Orchestrator', () => {
    let orchestrator: Orchestrator;

    beforeEach(async () => {
        vi.useFakeTimers();
        orchestrator = new Orchestrator({
            enableLogs: false,
        });
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.resetAllMocks();
    });

    it('makes persist prefixes unique', () => {
        const orchestrator1 = new Orchestrator({ persistencePrefix: 'TEST' });
        const orchestrator2 = new Orchestrator({ persistencePrefix: 'TEST' });

        expect(orchestrator1.options.persistencePrefix).toEqual('TEST');
        expect(orchestrator2.options.persistencePrefix).toEqual('TEST-2');
    });

    it('starts the scheduler upon client creation', async () => {
        const client = await orchestrator.apifyClient({ name: 'client-going-to-start' });
        const getAvailableMemorySpy = vi.spyOn(apifyApi, 'getUserLimits')
            .mockImplementation(async () => ({
                currentMemoryUsageGBs: Number.POSITIVE_INFINITY,
                maxMemoryGBs: Number.POSITIVE_INFINITY,
                activeActorJobCount: Number.POSITIVE_INFINITY,
                maxConcurrentActorJobs: Number.POSITIVE_INFINITY,
            }));
        client.actor('test').enqueue({ runName: 'test' });
        vi.advanceTimersByTime(MAIN_LOOP_INTERVAL_MS);
        expect(getAvailableMemorySpy).toHaveBeenCalledTimes(1);
    });

    it('makes client names unique', async () => {
        const client1 = await orchestrator.apifyClient({ name: 'test' });
        const client2 = await orchestrator.apifyClient({ name: 'test' });

        expect(client1.clientName).toEqual('test');
        expect(client2.clientName).toEqual('test-2');
    });

    it('gives clients a default unique name', async () => {
        const client1 = await orchestrator.apifyClient();
        const client2 = await orchestrator.apifyClient();

        expect(client1.clientName).toEqual('CLIENT');
        expect(client2.clientName).toEqual('CLIENT-2');
    });

    it('lets you create a dataset group', async () => {
        interface Item extends DatasetItem {
            title: string
        }
        const client = await orchestrator.apifyClient();
        const dataset1 = client.dataset<Item>('test-id1');
        const dataset2 = client.dataset<Item>('test-id2');
        const dataset3 = client.dataset<Item>('test-id3');
        const mergedDatasets = orchestrator.mergeDatasets(
            dataset1,
            dataset2,
            dataset3,
        );
        expect(mergedDatasets.datasets).toEqual([
            dataset1,
            dataset2,
            dataset3,
        ]);
    });

    // TODO: test different configurations?
});
