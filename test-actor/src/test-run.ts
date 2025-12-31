import { log } from 'apify';
import type { ActorRun } from 'apify-client';

import type { ExtendedApifyClient } from './orchestrator/types.js';
import type { Output } from './types.js';

export class TestRun {
    constructor(
        private readonly client: ExtendedApifyClient,
        public readonly run: ActorRun,
        public readonly runName: string,
    ) {}

    async getTotalOutput(): Promise<number> {
        let total = 0;
        try {
            const outputIterator = this.client.dataset<Output>(this.run.defaultDatasetId).iterate({ pageSize: 100 });
            for await (const item of outputIterator) {
                log.info(`Received random number from child ${this.runName}: ${item.value}`);
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
