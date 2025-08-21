import type { PaginatedList } from 'apify-client';
import { DatasetClient } from 'apify-client';
import type { DatasetItem } from 'src/index.js';
import { Orchestrator } from 'src/index.js';

describe('grouping-utils', () => {
    describe('DatasetGroupClass', () => {
        it('can iterate over items from all the datasets, in order', async () => {
            interface Item extends DatasetItem {
                title: string;
            }
            const dataset1: PaginatedList<Item> = {
                count: 1,
                desc: true,
                items: [{ title: 'A' }],
                limit: 0,
                offset: 0,
                total: 1,
            };
            const dataset2: PaginatedList<Item> = {
                count: 1,
                desc: true,
                items: [{ title: 'B' }],
                limit: 0,
                offset: 0,
                total: 1,
            };
            const dataset3: PaginatedList<Item> = {
                count: 1,
                desc: true,
                items: [{ title: 'C' }],
                limit: 0,
                offset: 0,
                total: 1,
            };

            vi.spyOn(DatasetClient.prototype, 'listItems')
                .mockImplementationOnce(async () => dataset1)
                .mockImplementationOnce(async () => dataset2)
                .mockImplementationOnce(async () => dataset3);

            const orchestrator = new Orchestrator();
            const client = await orchestrator.apifyClient();
            const mergedDatasets = orchestrator.mergeDatasets(
                client.dataset<Item>('test-id1'),
                client.dataset<Item>('test-id2'),
                client.dataset<Item>('test-id3'),
            );

            const datasetIterator = mergedDatasets.iterate({});
            const readItems: Item[] = [];
            for await (const item of datasetIterator) {
                readItems.push(item);
            }

            expect(readItems).toEqual([{ title: 'A' }, { title: 'B' }, { title: 'C' }]);
        });
    });
});
