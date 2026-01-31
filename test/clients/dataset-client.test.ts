import { DatasetClient } from 'apify-client';
import { ExtApifyClient } from 'src/clients/apify-client.js';
import type { ExtDatasetClient } from 'src/clients/dataset-client.js';
import type { DatasetItem } from 'src/types.js';
import { getClientContext } from 'test/_helpers/context.js';

interface TestItem extends DatasetItem {
    title: string;
}

describe('ExtDatasetClient', () => {
    const testItems: TestItem[] = [{ title: 'test-1' }, { title: 'test-2' }, { title: 'test-3' }];

    let apifyClient: ExtApifyClient;
    let datasetClient: ExtDatasetClient<TestItem>;

    beforeEach(() => {
        const context = getClientContext();
        apifyClient = new ExtApifyClient('test-client', context, {});
        datasetClient = apifyClient.dataset('test-dataset-id');
    });

    afterEach(() => {
        vi.resetAllMocks();
    });

    describe('iterate', () => {
        it('iterates the items from the dataset', async () => {
            const listItemsSpy = vi.spyOn(DatasetClient.prototype, 'listItems').mockResolvedValue({
                count: 3,
                items: testItems,
                total: 3,
                offset: 0,
                limit: undefined,
                desc: true,
            });
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
                .mockResolvedValueOnce({
                    count: 2,
                    items: testItems.slice(0, 2),
                    total: 3,
                    offset: 0,
                    limit: 2,
                    desc: true,
                })
                .mockResolvedValueOnce({
                    count: 1,
                    items: testItems.slice(2, 3),
                    total: 3,
                    offset: 2,
                    limit: 2,
                    desc: true,
                })
                .mockResolvedValueOnce({
                    count: 0,
                    items: [],
                    total: 3,
                    offset: 4,
                    limit: 2,
                    desc: true,
                });
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
