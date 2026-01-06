import type { ExtApifyClientContext, ExtApifyClientOptions } from './clients/apify-client.js';
import { ExtApifyClient } from './clients/apify-client.js';
import { DEFAULT_ORCHESTRATOR_OPTIONS } from './constants.js';
import { DatasetGroupClass } from './entities/dataset-group.js';
import { RunScheduler } from './run-scheduler.js';
import { RunTracker } from './run-tracker.js';
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
import { buildLogger } from './utils/logging.js';
import { makeNameUnique, makePrefixUnique } from './utils/naming.js';
import type { Storage } from './utils/storage.js';
import { buildStorage } from './utils/storage.js';

export * from './types.js';
export * from './errors.js';

const takenPersistPrefixes = new Set<string>();
const takenClientNames = new Set<string>();

export class Orchestrator implements ApifyOrchestrator {
    readonly options: OrchestratorOptions;
    protected readonly context: OrchestratorContext;
    protected readonly storage?: Storage;

    constructor(options: Partial<OrchestratorOptions> = {}) {
        const fullOptions = { ...DEFAULT_ORCHESTRATOR_OPTIONS, ...options };
        fullOptions.persistencePrefix = makePrefixUnique(fullOptions.persistencePrefix, takenPersistPrefixes);
        takenPersistPrefixes.add(fullOptions.persistencePrefix);
        this.options = fullOptions;

        const logger = buildLogger(this.options);
        this.context = { logger };
        this.storage = buildStorage(logger, this.options);
    }

    async apifyClient(options: ExtendedClientOptions = {}): Promise<ExtendedApifyClient> {
        const { name, ...superClientOptions } = options;

        const clientName = makeNameUnique(name ?? 'CLIENT', takenClientNames);
        takenClientNames.add(clientName);

        const runTracker = await RunTracker.new(this.context, {
            storage: this.storage,
            storagePrefix: `${this.options.persistencePrefix}${clientName}-`,
            onUpdate: this.options.onUpdate,
        });
        const runScheduler = new RunScheduler(this.context, {
            retryOnInsufficientResources: this.options.retryOnInsufficientResources,
            onRunStarted: (runName, run) => runTracker.updateRun(runName, run),
        });

        const extendedClientContext: ExtApifyClientContext = {
            ...this.context,
            runTracker,
            runScheduler,
        };
        const extendedClientOptions: ExtApifyClientOptions = {
            clientName,
            fixedInput: this.options.fixedInput,
            abortAllRunsOnGracefulAbort: this.options.abortAllRunsOnGracefulAbort,
            hideSensitiveInformation: this.options.hideSensitiveInformation,
            retryOnInsufficientResources: this.options.retryOnInsufficientResources,
        };

        const client = new ExtApifyClient(extendedClientContext, extendedClientOptions, superClientOptions);

        return client;
    }

    mergeDatasets<T extends DatasetItem>(...datasets: ExtendedDatasetClient<T>[]): DatasetGroup<T> {
        return new DatasetGroupClass(...datasets);
    }
}
