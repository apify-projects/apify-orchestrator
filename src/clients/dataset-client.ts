import { ACTOR_JOB_TERMINAL_STATUSES } from '@apify/consts';
import { DatasetClient } from 'apify-client';

import type { OrchestratorContext } from '../context/orchestrator-context.js';
import type { DatasetItem, ExtendedDatasetClient, GreedyListItemsOptions } from '../types.js';
import { isDefined } from '../utils/typing.js';

export class ExtDatasetClient<T extends DatasetItem> extends DatasetClient<T> implements ExtendedDatasetClient<T> {
    private readonly context: OrchestratorContext;

    /**
     * @internal
     */
    constructor(context: OrchestratorContext, datasetClient: DatasetClient) {
        super({
            baseUrl: datasetClient.baseUrl,
            publicBaseUrl: datasetClient.publicBaseUrl,
            apifyClient: datasetClient.apifyClient,
            httpClient: datasetClient.httpClient,
            id: datasetClient.id,
            params: datasetClient.params,
        });
        this.context = context;
    }

    async *greedyListItems(options: GreedyListItemsOptions = {}): AsyncGenerator<T, void, void> {
        const { offset = 0, limit, chunkSize = 100, pollIntervalSecs = 10, ...listItemOptions } = options;
        this.context.logger.info('Greedily iterating Dataset', { chunkSize }, { url: this.url });

        let readItemsCount = offset;

        // Poll the run status and fetch newly available items at each interval.
        while (true) {
            const dataset = await this.get();
            if (!isDefined(dataset?.actRunId)) {
                this.context.logger.error('Error getting Dataset while iterating greedily', { id: this.id });
                return;
            }

            const run = await this.apifyClient.run(dataset.actRunId).get();
            if (!isDefined(run)) {
                this.context.logger.error('Error getting Run while iterating Dataset greedily', { id: this.id });
                return;
            }

            const itemList = await super.listItems({
                ...listItemOptions,
                offset: readItemsCount,
                limit: chunkSize,
            });
            readItemsCount += itemList.count;
            for (const item of itemList.items) {
                yield item;
            }

            const isTerminal = (ACTOR_JOB_TERMINAL_STATUSES as readonly string[]).includes(run.status);
            if (isTerminal) {
                break;
            }

            await new Promise<void>((resolve) => {
                setTimeout(resolve, pollIntervalSecs * 1000);
            });
        }

        // Drain any remaining items. We cannot rely on dataset.itemCount here because it is
        // eventually consistent — instead we keep fetching pages until we receive an empty one.
        while (true) {
            const itemList = await super.listItems({
                ...listItemOptions,
                offset: readItemsCount,
                limit: chunkSize,
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
