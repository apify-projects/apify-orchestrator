import { DatasetClient } from 'apify-client';
import { ExtApifyClient } from 'src/clients/apify-client.js';
import type { ExtDatasetClient } from 'src/clients/dataset-client.js';
import { DEFAULT_ORCHESTRATOR_OPTIONS } from 'src/constants.js';
import { RunsTracker } from 'src/tracker.js';
import type { DatasetItem, OrchestratorOptions } from 'src/types.js';
import type { OrchestratorContext } from 'src/utils/context.js';
import { generateLogger } from 'src/utils/logging.js';

interface TestItem extends DatasetItem {
    title: string;
}

describe('ExtDatasetClient', () => {
    let context: OrchestratorContext;
    let options: OrchestratorOptions;
    let datasetClient: ExtDatasetClient<TestItem>;

    const generateApifyClient = () => new ExtApifyClient(context, { clientName: 'test-client', ...options });

    function generateExtDatasetClient() {
        const client = generateApifyClient();
        return client.dataset<TestItem>('test-id');
    }

    const testItems: TestItem[] = [{ title: 'test-1' }, { title: 'test-2' }, { title: 'test-3' }];

    beforeEach(async () => {
        vi.useFakeTimers();
        const logger = generateLogger({ enableLogs: false, hideSensitiveInformation: false });
        const runsTracker = await RunsTracker.new(
            { logger },
            { enableFailedHistory: false, persistenceSupport: 'none', persistencePrefix: 'TEST-' },
        );
        context = { logger, runsTracker };
        options = {
            ...DEFAULT_ORCHESTRATOR_OPTIONS,
            enableLogs: false,
        };
        datasetClient = generateExtDatasetClient();
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.resetAllMocks();
    });

    describe('iterate', () => {
        it('iterates the items from the dataset', async () => {
            const listItemsSpy = vi.spyOn(DatasetClient.prototype, 'listItems').mockImplementation(async () => ({
                count: 3,
                items: testItems,
                total: 3,
                offset: 0,
                limit: undefined,
                desc: true,
            }));
            const datasetIterator = datasetClient.iterate();
            let index = 0;
            for await (const item of datasetIterator) {
                expect(item).toEqual(testItems[index]);
                index++;
            }
            expect(index).toBe(3);
            expect(listItemsSpy).toHaveBeenCalledTimes(1);
            expect(listItemsSpy).toHaveBeenCalledWith({});
        });

        it('iterates the items from the dataset, using pagination', async () => {
            const listItemsSpy = vi
                .spyOn(DatasetClient.prototype, 'listItems')
                .mockImplementationOnce(async () => ({
                    count: 2,
                    items: testItems.slice(0, 2),
                    total: 3,
                    offset: 0,
                    limit: 2,
                    desc: true,
                }))
                .mockImplementationOnce(async () => ({
                    count: 1,
                    items: testItems.slice(2, 3),
                    total: 3,
                    offset: 2,
                    limit: 2,
                    desc: true,
                }))
                .mockImplementationOnce(async () => ({
                    count: 0,
                    items: [],
                    total: 3,
                    offset: 4,
                    limit: 2,
                    desc: true,
                }));
            const datasetIterator = datasetClient.iterate({ pageSize: 2 });
            let index = 0;
            for await (const item of datasetIterator) {
                expect(item).toEqual(testItems[index]);
                index++;
            }
            expect(index).toBe(3);
            expect(listItemsSpy).toHaveBeenCalledTimes(3);
            expect(listItemsSpy).toHaveBeenNthCalledWith(1, { offset: 0, limit: 2 });
            expect(listItemsSpy).toHaveBeenNthCalledWith(2, { offset: 2, limit: 2 });
            expect(listItemsSpy).toHaveBeenNthCalledWith(3, { offset: 4, limit: 2 });
        });
    });

    describe('greedyIterate', () => {
        it('iterates the items from the dataset as soon as one batch is available, using pagination', () => {
            // TODO: test
        });

        it('iterates the items from the dataset as soon as new items are available, setting pageSize to 0', () => {
            // TODO: test
        });
    });
});
