import { log } from 'apify';
import type { ActorRun } from 'apify-client';

import type { ExtendedApifyClient } from '../types.js';
import type { Output } from './types.js';

export class TestRun {
    private readonly client: ExtendedApifyClient;
    public readonly run: ActorRun;
    public readonly runName: string;

    constructor(client: ExtendedApifyClient, run: ActorRun, runName: string) {
        this.client = client;
        this.run = run;
        this.runName = runName;
    }

    /**
     * Reads the output of the Run in batches of the given size, using `listItemsBatched`.
     * The Run is expected to have finished already.
     */
    async getOutputBatches(batchSize: number): Promise<Output[][]> {
        const batches: Output[][] = [];
        const outputIterator = this.client
            .dataset<Output>(this.run.defaultDatasetId)
            .listItemsBatched({ batchSize, chunkSize: 100 });
        for await (const batch of outputIterator) {
            log.info(`Received a batch of ${batch.length} items from child ${this.runName}`);
            batches.push(batch);
        }
        return batches;
    }

    /**
     * Reads the output of the Run in batches of the given size, as it becomes available,
     * using `greedyListItemsBatched`. The Run may still be running.
     */
    async getGreedyOutputBatches(batchSize: number): Promise<Output[][]> {
        const batches: Output[][] = [];
        const outputIterator = this.client
            .dataset<Output>(this.run.defaultDatasetId)
            .greedyListItemsBatched({ batchSize, chunkSize: 100, pollIntervalSecs: 1 });
        for await (const batch of outputIterator) {
            log.info(`Received a greedy batch of ${batch.length} items from child ${this.runName}`);
            batches.push(batch);
        }
        return batches;
    }

    async getTotalOutput(): Promise<number> {
        let total = 0;
        try {
            const outputIterator = this.client.dataset<Output>(this.run.defaultDatasetId).listItems({ chunkSize: 100 });
            for await (const item of outputIterator) {
                log.info(`Received output value from child ${this.runName}: ${item.value}`);
                total += item.value;
            }
        } catch (error) {
            log.exception(error as Error, `Error retrieving output from child actor ${this.runName}`, {
                datasetId: this.run.defaultDatasetId,
            });
        }
        return total;
    }
}
