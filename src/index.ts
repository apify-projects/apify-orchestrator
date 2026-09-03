import { Actor } from 'apify';

import { ExtApifyClient } from './clients/apify-client.js';
import { DEFAULT_ORCHESTRATOR_OPTIONS } from './constants.js';
import { generateClientContext } from './context/client-context.js';
import type { OrchestratorContext } from './context/orchestrator-context.js';
import { generateOrchestratorContext } from './context/orchestrator-context.js';
import { DatasetGroupClass } from './entities/dataset-group.js';
import type { TrackedRuns } from './run-tracker.js';
import type {
    ApifyOrchestrator,
    DatasetGroup,
    DatasetItem,
    ExtendedApifyClient,
    ExtendedClientOptions,
    ExtendedDatasetClient,
    OrchestratorOptions,
} from './types.js';
import { makeNameUnique, makePrefixUnique } from './utils/naming.js';
import type { Storage } from './utils/storage.js';
import { buildStorage } from './utils/storage.js';
import { isDefined } from './utils/typing.js';

export * from './types.js';
export * from './errors.js';

const takenPersistPrefixes = new Set<string>();
const takenClientNames = new Set<string>();

const TRACKED_RUNS_KEY = 'RUNS';

export class Orchestrator implements ApifyOrchestrator {
    readonly options: OrchestratorOptions;

    protected readonly context: OrchestratorContext;
    protected readonly storage?: Storage;

    constructor(options: Partial<OrchestratorOptions> = {}) {
        const fullOptions = { ...DEFAULT_ORCHESTRATOR_OPTIONS, ...options };
        validateMaxConcurrency(fullOptions.maxConcurrency);
        fullOptions.persistencePrefix = makePrefixUnique(fullOptions.persistencePrefix, takenPersistPrefixes);
        takenPersistPrefixes.add(fullOptions.persistencePrefix);
        this.options = fullOptions;

        this.context = generateOrchestratorContext(this.options);
        this.storage = buildStorage(this.context);
    }

    async apifyClient(options: ExtendedClientOptions = {}): Promise<ExtendedApifyClient> {
        const { name, maxConcurrency, ...superClientOptions } = options;
        validateMaxConcurrency(maxConcurrency);

        const clientName = makeNameUnique(name ?? 'CLIENT', takenClientNames);
        takenClientNames.add(clientName);

        superClientOptions.token ??= Actor.getEnv().token ?? undefined;

        // Create the default object here to avoid shared references.
        const defaultTrackedRuns = {
            current: {},
            failedHistory: {},
        };

        const storagePrefix = `${this.options.persistencePrefix}${clientName}-`;
        const storageKey = `${storagePrefix}${TRACKED_RUNS_KEY}`;
        const trackedRuns =
            (await this.storage?.useState<TrackedRuns>(storageKey, defaultTrackedRuns)) ?? defaultTrackedRuns;

        const clientContext = generateClientContext(this.context, trackedRuns, {
            maxConcurrency: maxConcurrency ?? this.options.maxConcurrency,
        });

        return new ExtApifyClient(clientName, clientContext, superClientOptions);
    }

    mergeDatasets<T extends DatasetItem>(...datasets: ExtendedDatasetClient<T>[]): DatasetGroup<T> {
        return new DatasetGroupClass(...datasets);
    }
}

function validateMaxConcurrency(maxConcurrency?: number): void {
    if (!isDefined(maxConcurrency)) return;
    if (!Number.isInteger(maxConcurrency) || maxConcurrency < 1) {
        throw new RangeError(`maxConcurrency must be a positive integer, but it was ${maxConcurrency}.`);
    }
}
