import type { Dataset } from 'apify-client';
import { DatasetClient, RunClient } from 'apify-client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { getClientContext } from '../__unit__/context.js';
import { createActorRunMock } from '../__unit__/mocks.js';
import type { DatasetItem } from '../types.js';
import { ExtApifyClient } from './apify-client.js';
import type { ExtDatasetClient } from './dataset-client.js';

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
                limit: 1000,
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
                    offset: 3,
                    limit: 2,
                    desc: true,
                });
            const datasetIterator = datasetClient.iterate({ pageSize: 2 });
            let itemCount = 0;
            for await (const item of datasetIterator) {
                expect(item).toEqual(testItems[itemCount]);
                itemCount++;
            }
            expect(itemCount).toBe(3);
            expect(listItemsSpy).toHaveBeenCalledTimes(3);
            expect(listItemsSpy).toHaveBeenNthCalledWith(1, { offset: 0, limit: 2 });
            expect(listItemsSpy).toHaveBeenNthCalledWith(2, { offset: 2, limit: 2 });
            expect(listItemsSpy).toHaveBeenNthCalledWith(3, { offset: 4, limit: 2 });
        });

        it('preserves listItems options on every page when paginating', async () => {
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
                    offset: 3,
                    limit: 2,
                    desc: true,
                });
            const datasetIterator = datasetClient.iterate({ pageSize: 2, desc: true });
            let itemCount = 0;
            for await (const item of datasetIterator) {
                expect(item).toEqual(testItems[itemCount]);
                itemCount++;
            }
            expect(itemCount).toBe(3);
            expect(listItemsSpy).toHaveBeenCalledTimes(3);
            expect(listItemsSpy).toHaveBeenNthCalledWith(1, { desc: true, offset: 0, limit: 2 });
            expect(listItemsSpy).toHaveBeenNthCalledWith(2, { desc: true, offset: 2, limit: 2 });
            expect(listItemsSpy).toHaveBeenNthCalledWith(3, { desc: true, offset: 4, limit: 2 });
        });

        it('yields no items when the dataset is empty', async () => {
            const listItemsSpy = vi.spyOn(DatasetClient.prototype, 'listItems').mockResolvedValue({
                count: 0,
                items: [],
                total: 0,
                offset: 0,
                limit: 1000,
                desc: true,
            });
            const datasetIterator = datasetClient.iterate();
            const readItems: TestItem[] = [];
            for await (const item of datasetIterator) {
                readItems.push(item);
            }
            expect(readItems).toEqual([]);
            expect(listItemsSpy).toHaveBeenCalledTimes(1);
        });
    });

    describe('iterateBatched', () => {
        it('iterates batches of items from the dataset', async () => {
            const listItemsSpy = vi.spyOn(DatasetClient.prototype, 'listItems').mockResolvedValue({
                count: 3,
                items: testItems,
                total: 3,
                offset: 0,
                limit: 1000,
                desc: true,
            });
            const datasetIterator = datasetClient.iterateBatched();
            let batchCount = 0;
            let totalItems = 0;
            for await (const batch of datasetIterator) {
                expect(batch).toEqual(testItems);
                totalItems += batch.length;
                batchCount++;
            }
            expect(batchCount).toBe(1);
            expect(totalItems).toBe(3);
            expect(listItemsSpy).toHaveBeenCalledTimes(1);
            expect(listItemsSpy).toHaveBeenCalledWith({});
        });

        it('iterates batches of items from the dataset, using pagination', async () => {
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
                    offset: 3,
                    limit: 2,
                    desc: true,
                });
            const datasetIterator = datasetClient.iterateBatched({ pageSize: 2 });
            let batchCount = 0;
            let totalItems = 0;
            const batches: TestItem[][] = [];
            for await (const batch of datasetIterator) {
                batches.push(batch);
                totalItems += batch.length;
                batchCount++;
            }
            expect(batchCount).toBe(2);
            expect(totalItems).toBe(3);
            expect(batches[0]).toEqual(testItems.slice(0, 2));
            expect(batches[1]).toEqual(testItems.slice(2, 3));
            expect(listItemsSpy).toHaveBeenCalledTimes(3);
            expect(listItemsSpy).toHaveBeenNthCalledWith(1, { offset: 0, limit: 2 });
            expect(listItemsSpy).toHaveBeenNthCalledWith(2, { offset: 2, limit: 2 });
            expect(listItemsSpy).toHaveBeenNthCalledWith(3, { offset: 4, limit: 2 });
        });

        it('yields no batches when the dataset is empty', async () => {
            const listItemsSpy = vi.spyOn(DatasetClient.prototype, 'listItems').mockResolvedValue({
                count: 0,
                items: [],
                total: 0,
                offset: 0,
                limit: 1000,
                desc: true,
            });
            const datasetIterator = datasetClient.iterateBatched();
            const batches: TestItem[][] = [];
            for await (const batch of datasetIterator) {
                batches.push(batch);
            }
            expect(batches).toEqual([]);
            expect(listItemsSpy).toHaveBeenCalledTimes(1);
        });
    });

    describe('greedyIterate', () => {
        it('iterates the items as they become available, then drains the remaining ones after the run finishes', async () => {
            const getDatasetSpy = vi
                .spyOn(DatasetClient.prototype, 'get')
                .mockResolvedValue({ actRunId: 'test-run-id' } as Dataset);
            const getRunSpy = vi
                .spyOn(RunClient.prototype, 'get')
                .mockResolvedValueOnce(createActorRunMock({ status: 'RUNNING' }))
                .mockResolvedValueOnce(createActorRunMock({ status: 'SUCCEEDED' }));
            const listItemsSpy = vi
                .spyOn(DatasetClient.prototype, 'listItems')
                // First poll: the run is still running, two items are available.
                .mockResolvedValueOnce({
                    count: 2,
                    items: testItems.slice(0, 2),
                    total: 2,
                    offset: 0,
                    limit: 2,
                    desc: true,
                })
                // Second poll: the run has succeeded, one new item is available.
                .mockResolvedValueOnce({
                    count: 1,
                    items: testItems.slice(2, 3),
                    total: 3,
                    offset: 2,
                    limit: 2,
                    desc: true,
                })
                // Drain: no more items.
                .mockResolvedValueOnce({
                    count: 0,
                    items: [],
                    total: 3,
                    offset: 3,
                    limit: 2,
                    desc: true,
                });

            const datasetIterator = datasetClient.greedyIterate({ pageSize: 2, pollIntervalSecs: 0 });
            const readItems: TestItem[] = [];
            for await (const item of datasetIterator) {
                readItems.push(item);
            }

            expect(readItems).toEqual(testItems);
            expect(getDatasetSpy).toHaveBeenCalledTimes(2);
            expect(getRunSpy).toHaveBeenCalledTimes(2);
            expect(listItemsSpy).toHaveBeenCalledTimes(3);
            expect(listItemsSpy).toHaveBeenNthCalledWith(1, { offset: 0, limit: 2 });
            expect(listItemsSpy).toHaveBeenNthCalledWith(2, { offset: 2, limit: 2 });
            expect(listItemsSpy).toHaveBeenNthCalledWith(3, { offset: 3, limit: 2 });
        });

        it('stops without yielding items if the dataset has no associated run', async () => {
            vi.spyOn(DatasetClient.prototype, 'get').mockResolvedValue({ actRunId: undefined } as Dataset);
            const listItemsSpy = vi.spyOn(DatasetClient.prototype, 'listItems');

            const datasetIterator = datasetClient.greedyIterate({ pageSize: 2, pollIntervalSecs: 0 });
            const readItems: TestItem[] = [];
            for await (const item of datasetIterator) {
                readItems.push(item);
            }

            expect(readItems).toEqual([]);
            expect(listItemsSpy).not.toHaveBeenCalled();
        });

        it('stops without yielding items if the associated run cannot be retrieved', async () => {
            vi.spyOn(DatasetClient.prototype, 'get').mockResolvedValue({ actRunId: 'test-run-id' } as Dataset);
            vi.spyOn(RunClient.prototype, 'get').mockResolvedValue(undefined);
            const listItemsSpy = vi.spyOn(DatasetClient.prototype, 'listItems');

            const datasetIterator = datasetClient.greedyIterate({ pageSize: 2, pollIntervalSecs: 0 });
            const readItems: TestItem[] = [];
            for await (const item of datasetIterator) {
                readItems.push(item);
            }

            expect(readItems).toEqual([]);
            expect(listItemsSpy).not.toHaveBeenCalled();
        });
    });

    describe('greedyIterateBatched', () => {
        it('iterates batches as they become available, skipping empty polls', async () => {
            vi.spyOn(DatasetClient.prototype, 'get').mockResolvedValue({ actRunId: 'test-run-id' } as Dataset);
            const getRunSpy = vi
                .spyOn(RunClient.prototype, 'get')
                .mockResolvedValueOnce(createActorRunMock({ status: 'RUNNING' }))
                .mockResolvedValueOnce(createActorRunMock({ status: 'RUNNING' }))
                .mockResolvedValueOnce(createActorRunMock({ status: 'SUCCEEDED' }));
            const listItemsSpy = vi
                .spyOn(DatasetClient.prototype, 'listItems')
                // First poll: the run is still running, two items are available.
                .mockResolvedValueOnce({
                    count: 2,
                    items: testItems.slice(0, 2),
                    total: 2,
                    offset: 0,
                    limit: 2,
                    desc: true,
                })
                // Second poll: the run is still running, no new items yet.
                .mockResolvedValueOnce({
                    count: 0,
                    items: [],
                    total: 2,
                    offset: 2,
                    limit: 2,
                    desc: true,
                })
                // Third poll: the run has succeeded, one new item is available.
                .mockResolvedValueOnce({
                    count: 1,
                    items: testItems.slice(2, 3),
                    total: 3,
                    offset: 2,
                    limit: 2,
                    desc: true,
                })
                // Drain: no more items.
                .mockResolvedValueOnce({
                    count: 0,
                    items: [],
                    total: 3,
                    offset: 3,
                    limit: 2,
                    desc: true,
                });

            const datasetIterator = datasetClient.greedyIterateBatched({ pageSize: 2, pollIntervalSecs: 0 });
            const batches: TestItem[][] = [];
            for await (const batch of datasetIterator) {
                batches.push(batch);
            }

            expect(batches).toEqual([testItems.slice(0, 2), testItems.slice(2, 3)]);
            expect(getRunSpy).toHaveBeenCalledTimes(3);
            expect(listItemsSpy).toHaveBeenCalledTimes(4);
            expect(listItemsSpy).toHaveBeenNthCalledWith(1, { offset: 0, limit: 2 });
            expect(listItemsSpy).toHaveBeenNthCalledWith(2, { offset: 2, limit: 2 });
            expect(listItemsSpy).toHaveBeenNthCalledWith(3, { offset: 2, limit: 2 });
            expect(listItemsSpy).toHaveBeenNthCalledWith(4, { offset: 3, limit: 2 });
        });
    });
});
