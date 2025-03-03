import { DatasetClient } from 'apify-client';

import { RunsTracker } from '../tracker.js';
import { DatasetItem, GreedyIterateOptions, ExtendedDatasetClient, IterateOptions } from '../types.js';
import { CustomLogger } from '../utils/logging.js';

export class ExtDatasetClient<T extends DatasetItem> extends DatasetClient<T> implements ExtendedDatasetClient<T> {
    protected superClient: DatasetClient<T>;
    protected customLogger: CustomLogger;
    protected runsTracker: RunsTracker;

    constructor(datasetClient: DatasetClient<T>, customLogger: CustomLogger, runsTracker: RunsTracker) {
        super({
            baseUrl: datasetClient.baseUrl,
            apifyClient: datasetClient.apifyClient,
            httpClient: datasetClient.httpClient,
            id: datasetClient.id,
            params: datasetClient.params,
        });
        this.customLogger = customLogger;
        this.superClient = datasetClient;
        this.runsTracker = runsTracker;
    }

    async* iterate(options: IterateOptions = {}): AsyncGenerator<T, void, void> {
        const { pageSize, ...listItemOptions } = options;
        this.customLogger.info('Iterating Dataset', { pageSize }, { url: this.url });

        let totalItems = 0;

        if (pageSize) {
            let currentOffset = listItemOptions.offset ?? 0;
            let currentPage = await this.superClient.listItems({
                ...listItemOptions,
                offset: currentOffset,
                limit: pageSize,
            });
            while (currentPage.items.length > 0) {
                totalItems += currentPage.items.length;
                for (const item of currentPage.items) {
                    yield item;
                }

                currentOffset += pageSize;
                currentPage = await this.superClient.listItems({ offset: currentOffset, limit: pageSize });
            }
        } else {
            const itemList = await this.superClient.listItems(listItemOptions);
            totalItems += itemList.items.length;
            for (const item of itemList.items) {
                yield item;
            }
        }

        this.customLogger.info('Finished reading dataset', { totalItems }, { url: this.url });
    }

    async* greedyIterate(options: GreedyIterateOptions = {}): AsyncGenerator<T, void, void> {
        const { pollIntervalSecs = 10, ...iterateOptions } = options;
        this.customLogger.info('Greedily iterating Dataset', { pageSize: iterateOptions.pageSize }, { url: this.url });

        let currentOffset = iterateOptions.offset ?? 0;

        const runId = (await this.get())?.actRunId;

        let runStatus = runId ? (await this.apifyClient.run(runId).get())?.status : undefined;

        if (runId) {
            while (runStatus && ['READY', 'RUNNING'].includes(runStatus)) {
                const datasetIterator = this.iterate({ ...iterateOptions, offset: currentOffset });
                for await (const item of datasetIterator) {
                    currentOffset++;
                    yield item;
                }

                await new Promise((resolve) => setTimeout(resolve, pollIntervalSecs * 1000));

                runStatus = (await this.apifyClient.run(runId).get())?.status;
            }
        } else {
            this.customLogger.error(
                'Greedy iterate: error getting Dataset or associated run\'s ID; trying to read the remaining items.',
            );
        }

        if (runId && !runStatus) {
            this.customLogger.error(
                'Greedy iterate: error getting associated run\'s status: trying to read the remaining items.',
            );
        }

        const datasetIterator = this.iterate({ ...iterateOptions, offset: currentOffset });
        for await (const item of datasetIterator) {
            yield item;
        }
    }
}
