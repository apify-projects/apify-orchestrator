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
import type { GlobalContext, OrchestratorContext } from './utils/context.js';
import { generateLogger } from './utils/logging.js';
import { makeNameUnique } from './utils/naming.js';

export * from './types.js';
export * from './errors.js';

const takenPersistPrefixes = new Set<string>();
const takenClientNames = new Set<string>();

export class Orchestrator implements ApifyOrchestrator {
    readonly options: OrchestratorOptions;
    protected readonly context: GlobalContext;

    constructor(options: Partial<OrchestratorOptions> = {}) {
        const fullOptions = { ...DEFAULT_ORCHESTRATOR_OPTIONS, ...options };
        fullOptions.persistencePrefix = makeNameUnique(fullOptions.persistencePrefix, takenPersistPrefixes);
        takenPersistPrefixes.add(fullOptions.persistencePrefix);
        this.options = fullOptions;

        const { enableLogs, hideSensitiveInformation } = this.options;
        this.context = {
            logger: generateLogger({ enableLogs, hideSensitiveInformation }),
        };
    }

    async apifyClient(options: ExtendedClientOptions = {}): Promise<ExtendedApifyClient> {
        const { name, ...superClientOptions } = options;

        const clientName = makeNameUnique(name ?? 'CLIENT', takenClientNames);
        takenClientNames.add(clientName);

        const runsTracker = await RunsTracker.new(
            this.context,
            {
                enableFailedHistory: !this.options.hideSensitiveInformation,
                persistenceSupport: this.options.persistenceSupport,
                persistencePrefix: `${this.options.persistencePrefix}${clientName}-`,
                persistenceEncryptionKey: this.options.persistenceEncryptionKey,
            },
            this.options.onUpdate,
        );

        const context: OrchestratorContext = {
            logger: this.context.logger,
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
