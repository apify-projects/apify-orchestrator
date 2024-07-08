/**
 * This is temporarily a "copy-paste" kind of library.
 * Maybe, someday it will become a proper library or part of the SDK, who knows?
*/
import { Dataset } from 'apify';
import { DatasetClient } from 'apify-client';

import { ExtApifyClient } from './clients/apify-client.js';
import { ExtDatasetClient } from './clients/dataset-client.js';
import { DEFAULT_ORCHESTRATOR_OPTIONS } from './constants.js';
import { RunsTracker } from './tracker.js';
import {
    ApifyOrchestrator,
    DatasetItem,
    IterateOptions,
    OrchestratorOptions,
    ScheduledApifyClient,
    ScheduledClientOptions,
} from './types.js';
import { CustomLogger } from './utils/logging.js';

export const version = '0.0.2';

export * from './types.js';

// Use a singleton counter shared among all Orchestrator instances.
let clientsCounter = 0;

export class Orchestrator implements ApifyOrchestrator {
    protected options: OrchestratorOptions;
    protected customLogger: CustomLogger;

    constructor(options: Partial<OrchestratorOptions> = {}) {
        this.options = { ...DEFAULT_ORCHESTRATOR_OPTIONS, ...options };
        this.customLogger = new CustomLogger(this.options.enableLogs, this.options.hideSensibleInformation);
    }

    async apifyClient(options: ScheduledClientOptions = {}): Promise<ScheduledApifyClient> {
        const { name, ...apifyClientOptions } = options;

        clientsCounter++;

        const enableFailedRunsHistory = !this.options.hideSensibleInformation;
        const runsTracker = new RunsTracker(
            this.customLogger,
            enableFailedRunsHistory,
        );
        const clientName = name ?? `CLIENT-${clientsCounter}`;
        await runsTracker.init(this.options.persistSupport, `${this.options.persistPrefix}${clientName}-`);

        const client = new ExtApifyClient(
            clientName,
            this.customLogger,
            runsTracker,
            this.options.fixedInput,
            this.options.statsIntervalSec,
            this.options.abortAllRunsOnGracefulAbort,
            this.options.hideSensibleInformation,
            apifyClientOptions,
        );
        await client.startScheduler();

        return client;
    }

    async* iterateDataset<T extends DatasetItem>(
        dataset: Dataset<T>,
        options: IterateOptions,
    ): AsyncGenerator<T, void, void> {
        const datasetIterator = new ExtDatasetClient<T>(dataset.client as DatasetClient<T>, this.customLogger)
            .iterate(options);
        for await (const item of datasetIterator) {
            yield item;
        }
    }
}
