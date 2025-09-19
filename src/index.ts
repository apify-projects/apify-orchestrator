/**
 * This is temporarily a "copy-paste" kind of library.
 * Maybe, someday it will become a proper library or part of the SDK, who knows?
 */

import { ExtApifyClient } from './clients/apify-client.js';
import { DEFAULT_ORCHESTRATOR_OPTIONS } from './constants.js';
import { DatasetGroupClass } from './entities/dataset-group.js';
import { RunsTracker } from './tracker.js';
import type {
    ApifyOrchestrator,
    DatasetGroup,
    DatasetItem,
    ExtendedApifyClient,
    ExtendedClientOptions,
    ExtendedDatasetClient,
    OrchestratorOptions,
} from './types.js';
import { CustomLogger } from './utils/logging.js';
import { makeNameUnique } from './utils/naming.js';

export * from './types.js';
export * from './errors.js';

const takenPersistPrefixes = new Set<string>();
const takenClientNames = new Set<string>();

export class Orchestrator implements ApifyOrchestrator {
    readonly options: OrchestratorOptions;
    protected customLogger: CustomLogger;

    constructor(options: Partial<OrchestratorOptions> = {}) {
        const fullOptions = { ...DEFAULT_ORCHESTRATOR_OPTIONS, ...options };
        fullOptions.persistencePrefix = makeNameUnique(fullOptions.persistencePrefix, takenPersistPrefixes);
        takenPersistPrefixes.add(fullOptions.persistencePrefix);
        this.options = fullOptions;
        this.customLogger = new CustomLogger(this.options.enableLogs, this.options.hideSensitiveInformation);
    }

    async apifyClient(options: ExtendedClientOptions = {}): Promise<ExtendedApifyClient> {
        const { name, ...apifyClientOptions } = options;

        const clientName = makeNameUnique(name ?? 'CLIENT', takenClientNames);
        takenClientNames.add(clientName);

        const enableFailedRunsHistory = !this.options.hideSensitiveInformation;
        const runsTracker = new RunsTracker(this.customLogger, enableFailedRunsHistory, this.options.onUpdate);

        await runsTracker.init(
            this.options.persistenceSupport,
            `${this.options.persistencePrefix}${clientName}-`,
            this.options.persistenceEncryptionKey,
        );

        const client = new ExtApifyClient(
            clientName,
            this.customLogger,
            runsTracker,
            this.options.fixedInput,
            this.options.abortAllRunsOnGracefulAbort,
            this.options.hideSensitiveInformation,
            this.options.retryOnInsufficientResources,
            apifyClientOptions,
        );
        client.startScheduler();

        return client;
    }

    mergeDatasets<T extends DatasetItem>(...datasets: ExtendedDatasetClient<T>[]): DatasetGroup<T> {
        return new DatasetGroupClass(...datasets);
    }
}
