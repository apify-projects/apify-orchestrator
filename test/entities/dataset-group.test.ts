import type { PaginatedList } from 'apify-client';
import { DatasetClient } from 'apify-client';
import type { DatasetItem, ExtendedApifyClient } from 'src/index.js';
import { Orchestrator } from 'src/index.js';
import { getTestOptions } from 'test/_helpers/context.js';
import { beforeEach, describe, expect, it } from 'vitest';

describe('DatasetGroupClass', () => {
    let orchestrator: Orchestrator;
    let client: ExtendedApifyClient;

    beforeEach(async () => {
        const options = getTestOptions();
        orchestrator = new Orchestrator(options);
        client = await orchestrator.apifyClient({ name: 'test-client' });
    });

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
            .mockResolvedValueOnce(dataset1)
            .mockResolvedValueOnce(dataset2)
            .mockResolvedValueOnce(dataset3);

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
