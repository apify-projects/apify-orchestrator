import type { ActorRun, Dataset } from 'apify-client';
import { DatasetClient } from 'apify-client';

import type { RunsTracker } from '../tracker.js';
import type { DatasetItem, ExtendedDatasetClient, GreedyIterateOptions, IterateOptions } from '../types.js';
import type { CustomLogger } from '../utils/logging.js';

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

    async *iterate(options: IterateOptions = {}): AsyncGenerator<T, void, void> {
        const { pageSize, ...listItemOptions } = options;
        this.customLogger.info('Iterating Dataset', { pageSize }, { url: this.url });

        let totalItems = 0;

        if (pageSize) {
            let offset = 0;
            let currentPage = await this.superClient.listItems({ ...listItemOptions, offset, limit: pageSize });
            while (currentPage.items.length > 0) {
                totalItems += currentPage.items.length;
                for (const item of currentPage.items) {
                    yield item;
                }

                offset += pageSize;
                currentPage = await this.superClient.listItems({ offset, limit: pageSize });
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

    async *greedyIterate(options: GreedyIterateOptions = {}): AsyncGenerator<T, void, void> {
        const { pageSize = 100, itemsThreshold = 100, pollIntervalSecs = 10, ...listItemOptions } = options;
        this.customLogger.info('Greedily iterating Dataset', { pageSize }, { url: this.url });

        let readItemsCount = 0;

        let dataset: Dataset | undefined;
        let run: ActorRun | undefined;

        // TODO: breaking change - remove itemsThreshold and just listItems at every iteration
        while (true) {
            dataset = await this.get();
            if (!dataset || !dataset.actRunId) {
                this.customLogger.error('Error getting Dataset while iterating greedily', { id: this.id });
                return;
            }

            run = await this.apifyClient.run(dataset.actRunId).get();
            if (!run) {
                this.customLogger.error('Error getting Run while iterating Dataset greedily', { id: this.id });
                return;
            }

            if (run.status !== 'READY' && run.status !== 'RUNNING') {
                break;
            }

            if (dataset.itemCount >= readItemsCount + itemsThreshold) {
                const itemList = await this.superClient.listItems({
                    ...listItemOptions,
                    offset: readItemsCount,
                    limit: pageSize,
                });
                readItemsCount += itemList.count;
                for (const item of itemList.items) {
                    yield item;
                }
            }

            await new Promise((resolve) => {
                setTimeout(resolve, pollIntervalSecs * 1000);
            });
        }

        dataset = await this.get();
        if (!dataset || !dataset.actRunId) {
            this.customLogger.error('Error getting Dataset while iterating greedily', { id: this.id });
            return;
        }

        while (readItemsCount < dataset.itemCount) {
            const itemList = await this.superClient.listItems({
                ...listItemOptions,
                offset: readItemsCount,
                limit: pageSize,
            });
            if (itemList.count === 0) {
                break;
            }
            readItemsCount += itemList.count;
            for (const item of itemList.items) {
                yield item;
            }
        }
    }
}
