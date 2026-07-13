import type { PaginatedList } from 'apify-client';
import { DatasetClient } from 'apify-client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getTestOptions } from '../__unit__/context.js';
import type { DatasetItem, ExtendedApifyClient } from '../index.js';
import { Orchestrator } from '../index.js';

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

    it('can iterate over batches from all the datasets, in order', async () => {
        interface Item extends DatasetItem {
            title: string;
        }
        const dataset1: PaginatedList<Item> = {
            count: 2,
            desc: true,
            items: [{ title: 'A1' }, { title: 'A2' }],
            limit: 0,
            offset: 0,
            total: 2,
        };
        const dataset2: PaginatedList<Item> = {
            count: 2,
            desc: true,
            items: [{ title: 'B1' }, { title: 'B2' }],
            limit: 0,
            offset: 0,
            total: 2,
        };
        const dataset3: PaginatedList<Item> = {
            count: 2,
            desc: true,
            items: [{ title: 'C1' }, { title: 'C2' }],
            limit: 0,
            offset: 0,
            total: 2,
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

        const datasetIterator = mergedDatasets.iterateBatched({});
        const readBatches: Item[][] = [];
        for await (const batch of datasetIterator) {
            readBatches.push(batch);
        }

        expect(readBatches).toEqual([
            [{ title: 'A1' }, { title: 'A2' }],
            [{ title: 'B1' }, { title: 'B2' }],
            [{ title: 'C1' }, { title: 'C2' }],
        ]);
    });

    it('skips empty datasets when iterating over batches', async () => {
        interface Item extends DatasetItem {
            title: string;
        }
        const dataset1: PaginatedList<Item> = {
            count: 2,
            desc: true,
            items: [{ title: 'A1' }, { title: 'A2' }],
            limit: 0,
            offset: 0,
            total: 2,
        };
        const dataset2: PaginatedList<Item> = {
            count: 0,
            desc: true,
            items: [],
            limit: 0,
            offset: 0,
            total: 0,
        };
        const dataset3: PaginatedList<Item> = {
            count: 2,
            desc: true,
            items: [{ title: 'C1' }, { title: 'C2' }],
            limit: 0,
            offset: 0,
            total: 2,
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

        const datasetIterator = mergedDatasets.iterateBatched({});
        const readBatches: Item[][] = [];
        for await (const batch of datasetIterator) {
            readBatches.push(batch);
        }

        expect(readBatches).toEqual([
            [{ title: 'A1' }, { title: 'A2' }],
            [{ title: 'C1' }, { title: 'C2' }],
        ]);
    });

    it('paginates each dataset when iterating over batches with a page size', async () => {
        interface Item extends DatasetItem {
            title: string;
        }

        const page = (items: Item[], offset: number, total: number): PaginatedList<Item> => ({
            count: items.length,
            desc: true,
            items,
            limit: 2,
            offset,
            total,
        });

        vi.spyOn(DatasetClient.prototype, 'listItems')
            // First dataset: three items, read in two pages plus a final empty one.
            .mockResolvedValueOnce(page([{ title: 'A1' }, { title: 'A2' }], 0, 3))
            .mockResolvedValueOnce(page([{ title: 'A3' }], 2, 3))
            .mockResolvedValueOnce(page([], 4, 3))
            // Second dataset: two items, read in one page plus a final empty one.
            .mockResolvedValueOnce(page([{ title: 'B1' }, { title: 'B2' }], 0, 2))
            .mockResolvedValueOnce(page([], 2, 2));

        const mergedDatasets = orchestrator.mergeDatasets(
            client.dataset<Item>('test-id1'),
            client.dataset<Item>('test-id2'),
        );

        const datasetIterator = mergedDatasets.iterateBatched({ pageSize: 2 });
        const readBatches: Item[][] = [];
        for await (const batch of datasetIterator) {
            readBatches.push(batch);
        }

        expect(readBatches).toEqual([
            [{ title: 'A1' }, { title: 'A2' }],
            [{ title: 'A3' }],
            [{ title: 'B1' }, { title: 'B2' }],
        ]);
    });
});
