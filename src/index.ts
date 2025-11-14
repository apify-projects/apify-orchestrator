import type { ExtApifyClientOptions } from './clients/apify-client.js';
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
import type { OrchestratorContext } from './utils/context.js';
import type { Logger } from './utils/logging.js';
import { generateLogger } from './utils/logging.js';
import { makeNameUnique } from './utils/naming.js';

export * from './types.js';
export * from './errors.js';

const takenPersistPrefixes = new Set<string>();
const takenClientNames = new Set<string>();

export class Orchestrator implements ApifyOrchestrator {
    readonly options: OrchestratorOptions;
    protected logger: Logger;

    constructor(options: Partial<OrchestratorOptions> = {}) {
        const fullOptions = { ...DEFAULT_ORCHESTRATOR_OPTIONS, ...options };
        fullOptions.persistencePrefix = makeNameUnique(fullOptions.persistencePrefix, takenPersistPrefixes);
        takenPersistPrefixes.add(fullOptions.persistencePrefix);
        this.options = fullOptions;

        const { enableLogs, hideSensitiveInformation } = this.options;
        this.logger = generateLogger({ enableLogs, hideSensitiveInformation });
    }

    async apifyClient(options: ExtendedClientOptions = {}): Promise<ExtendedApifyClient> {
        const { name, ...superClientOptions } = options;

        const clientName = makeNameUnique(name ?? 'CLIENT', takenClientNames);
        takenClientNames.add(clientName);

        const enableFailedRunsHistory = !this.options.hideSensitiveInformation;
        const runsTracker = new RunsTracker(this.logger, enableFailedRunsHistory, this.options.onUpdate);

        await runsTracker.init(
            this.options.persistenceSupport,
            `${this.options.persistencePrefix}${clientName}-`,
            this.options.persistenceEncryptionKey,
        );

        const context: OrchestratorContext = {
            logger: this.logger,
            runsTracker,
        };

        const extendedClientOptions: ExtApifyClientOptions = {
            clientName,
            fixedInput: this.options.fixedInput,
            abortAllRunsOnGracefulAbort: this.options.abortAllRunsOnGracefulAbort,
            hideSensitiveInformation: this.options.hideSensitiveInformation,
            retryOnInsufficientResources: this.options.retryOnInsufficientResources,
        };

        const client = new ExtApifyClient(context, extendedClientOptions, superClientOptions);
        client.startScheduler();

        return client;
    }

    mergeDatasets<T extends DatasetItem>(...datasets: ExtendedDatasetClient<T>[]): DatasetGroup<T> {
        return new DatasetGroupClass(...datasets);
    }
}
