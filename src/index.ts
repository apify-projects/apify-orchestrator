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
import { DatasetItem, IterateOptions, OrchestratorOptions, ScheduledApifyClient, ScheduledClientOptions } from './types.js';
import { CustomLogger, disabledLogger, enabledLogger } from './utils/logging.js';

export const version = '2024-06-25';

export * from './types.js';

// Use a singleton counter shared among all Orchestrator instances.
let clientsCounter = 0;

export class Orchestrator {
    protected options: OrchestratorOptions;
    protected customLogger: CustomLogger;

    constructor(options: Partial<OrchestratorOptions> = {}) {
        this.options = { ...DEFAULT_ORCHESTRATOR_OPTIONS, ...options };
        this.customLogger = this.options.enableLogs ? enabledLogger : disabledLogger;
    }

    apifyClient = async (options: ScheduledClientOptions = {}): Promise<ScheduledApifyClient> => {
        const { name, ...apifyClientOptions } = options;

        clientsCounter++;

        const clientName = name ?? `CLIENT-${clientsCounter}`;
        const runsTracker = new RunsTracker();
        await runsTracker.init(
            this.customLogger, this.options.persistSupport, `${this.options.persistPrefix}${clientName}-`,
        );

        const client = new ExtApifyClient(
            clientName,
            this.customLogger,
            runsTracker,
            this.options.fixedInput,
            this.options.statsIntervalSec,
            this.options.abortAllRunsOnGracefulAbort,
            apifyClientOptions,
        );
        await client.startScheduler();

        return client;
    };

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
