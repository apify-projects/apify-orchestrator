import { ActorRun, Dataset, DatasetClient } from 'apify-client';

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
        const { pageSize, skip = 0, ...listItemOptions } = options;
        this.customLogger.info('Iterating Dataset', { pageSize, skip }, { url: this.url });

        let readItemsCount = 0;

        const offset = () => readItemsCount + skip

        if (pageSize) {
            let currentPage = await this.superClient.listItems({ ...listItemOptions, offset: offset(), limit: pageSize });
            while (currentPage.items.length > 0) {
                readItemsCount += currentPage.items.length;
                for (const item of currentPage.items) {
                    yield item;
                }
                currentPage = await this.superClient.listItems({ offset: offset(), limit: pageSize });
            }
        } else {
            const itemList = await this.superClient.listItems({ ...listItemOptions, offset: offset() });
            readItemsCount += itemList.items.length;
            for (const item of itemList.items) {
                yield item;
            }
        }

        this.customLogger.info('Finished reading dataset', { itemsRead: readItemsCount, skip }, { url: this.url });
    }

    async* greedyIterate(options: GreedyIterateOptions = {}): AsyncGenerator<T, void, void> {
        const { pageSize, pollIntervalSecs = 10, skip = 0, ...listItemOptions } = options;
        this.customLogger.info('Greedily iterating Dataset', { pageSize }, { url: this.url });

        let readItemsCount = 0;

        const offset = () => readItemsCount + skip;

        const runId = (await this.get())?.actRunId;
        if (!runId) {
            this.customLogger.error('Error getting Dataset while iterating greedily', {
                id: this.id
            });
            return;
        }

        while (true) {
            const run = await this.apifyClient.run(runId).get();
            if (!run) {
                this.customLogger.error('Error getting Run while iterating Dataset greedily', {
                    id: this.id
                });
                return;
            }

            if (!(run.status === 'READY' || run.status === 'RUNNING')) {
                this.customLogger.info('Run finished moving to normal iteration', {
                    readGreedilyCount: readItemsCount, skip
                })
                break;
            }

            const itemList = await this.superClient.listItems({
                ...listItemOptions,
                offset: offset(),
                limit: pageSize
            })

            readItemsCount += itemList.items.length;

            for (const item of itemList.items) {
                yield item;
            }

            if (itemList.items.length === pageSize) {
                // There are likely to be more items, so we continue ahead
                continue;
            }

            await new Promise((resolve) => setTimeout(resolve, pollIntervalSecs * 1000));
        }

        for await (const item of this.iterate({ pageSize, skip: offset() })) {
            yield item;
        }
    }
}
