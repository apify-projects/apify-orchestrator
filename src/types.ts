import { Dataset } from 'apify';
import {
    ActorCallOptions,
    ActorClient,
    ActorLastRunOptions,
    ActorRun,
    ActorStartOptions,
    ApifyClient,
    ApifyClientOptions,
    DatasetClient,
    DatasetClientListItemOptions,
    RunClient,
} from 'apify-client';

export interface OrchestratorOptions {
    /**
     * `true` by default.
     */
    enableLogs: boolean

    /**
     * `undefined` by default. If defined, the current Runs will be logged periodically.
     */
    statsIntervalSec?: number

    /**
     * `kvs` by default: the orchestrator data will be persisted on the KeyValueStore. Choose `none` to disable.
     */
    persistSupport: PersistSupport

    /**
     * `ORCHESTRATOR-` by default. Used to persist data on the KeyValueStore.
     */
    persistPrefix: string

    /**
     * `undefined` by default.
     * Some fixed input parameters to add to each Run.
     */
    fixedInput?: object

    /**
     * `true` by default. Abort all Runs on graceful abort of the Orchestrator.
     *
     * Notice that, if disabled, a function that is waiting for a Run to finish
     * may not notice when the orchestrator is aborted and will be killed abruptly.
     */
    abortAllRunsOnGracefulAbort: boolean
}

/**
 * The main Apify Orchestrator object, allowing to create clients with an internal scheduler and several more features.
 */
export interface ApifyOrchestrator {
    /**
     * Creates a new client object, with an internal scheduler.
     *
     * You can give each client a custom name. If you don't, an automatic name such as `CLIENT-1` is generated.
     *
     * @param options includes the options from `ApifyClientOptions` and `name`
     * @returns the `ScheduledApifyClient` object
     */
    apifyClient: (options?: ScheduledClientOptions) => Promise<ScheduledApifyClient>

    /**
     * Iterate any dataset using automatic pagination.
     *
     * @param dataset the `Dataset` object, e.g., `await Actor.openDataset(...)`
     * @param options the options for the iteration, including the page size
     * @returns an `AsyncGenerator` which iterates the items in the dataset
     */
    iterateDataset: <T extends DatasetItem>(dataset: Dataset<T>, options: IterateOptions) => AsyncGenerator<T, void, void>
}

export type ScheduledClientOptions = ApifyClientOptions & {
    /**
     * Used to identify a client, for instance, when storing its Runs in the Key Value Store.
     */
    name?: string
}

/**
 * Starts the Runs through a scheduler.
 *
 * @extends ApifyClient
 */
export interface ScheduledApifyClient extends ApifyClient {
    /**
     * @override
     */
    actor: (id: string) => QueuedActorClient

    /**
     * @override
     */
    dataset: <T extends DatasetItem>(id: string) => IterableDatasetClient<T>

    /**
     * @returns a Run client corresponding to the given name, if it exists
     */
    runByName: (name: string) => Promise<TrackedRunClient | undefined>

    /**
     * @returns an ActorRun object corresponding to the given name, if it exists
     */
    actorRunByName: (name: string) => Promise<ActorRun | undefined>

    /**
     * Searches for the Runs with the given names an generates a `RunRecord` with them.
     */
    runRecord: (...runNames: string[]) => Promise<RunRecord>

    /**
     * Waits for one or more Runs previously started.
     *
     * @param batch a `RunRecord` object or a list of names
     * @returns an updated `RunRecord`
     */
    waitForBatchFinish: (batch: RunRecord | string[]) => Promise<RunRecord>

    /**
     * Stop all the Runs in progress started from this client.
     */
    abortAllRuns: () => Promise<void>

    /**
     * Iterate the items in the default dataset of one or more Runs.
     *
     * @param resource a single `ActorRun` or a `RunRecord`
     * @param options the options for the iteration, including the page size
     * @returns an `AsyncGenerator` which iterates the items from all the default datasets
     */
    iterateOutput: <T extends DatasetItem>(resource: ActorRun | RunRecord, options: IterateOptions) => AsyncGenerator<T, void, void>
}

/**
 * An Actor client which enqueues the requests for new Runs, instead of starting them directly.
 *
 * @extends ActorClient
 */
export interface QueuedActorClient extends ActorClient {
    /**
     * Enqueues one or more requests for new Runs, and return immediately.
     *
     * @param runRequests the requests
     * @returns the future names of the Runs
     */
    enqueue: (...runRequests: ActorRunRequest[]) => string[]

    /**
     * Enqueues one or more requests for new Runs, given the parameters to generate input batches.
     *
     * @param namePrefix the prefix for each Run's name; if just one Run is enqueued, it is the full name
     * @param sources an array used to generate the input batches
     * @param inputGenerator the function used to generate the input batches
     * @param overrideSplitRules the rules for splitting
     * @param options the options for starting the Runs
     * @returns the future names of the Runs
     */
    enqueueBatch: <T>(
        namePrefix: string,
        sources: T[],
        inputGenerator: (chunk: T[]) => object,
        overrideSplitRules?: Partial<SplitRules>,
        options?: ActorStartOptions,
    ) => string[]

    /**
     * @override
     */
    start: (runName: string, input?: object, options?: ActorStartOptions) => Promise<ActorRun>

    /**
     * Starts one or more Runs, based on an array of requests.
     */
    startRuns: (...runRequests: ActorRunRequest[]) => Promise<RunRecord>

    /**
     * Starts one or more requests for new Runs, given the parameters to generate input batches.
     *
     * @param namePrefix the prefix for each Run's name; if just one Run is started, it is the full name
     * @param sources an array used to generate the input batches
     * @param inputGenerator the function used to generate the input batches
     * @param overrideSplitRules the rules for splitting
     * @param options the options for starting the Runs
     * @returns the future names of the Runs
     */
    startBatch: <T>(
        namePrefix: string,
        sources: T[],
        inputGenerator: (chunk: T[]) => object,
        overrideSplitRules?: Partial<SplitRules>,
        options?: ActorStartOptions,
    ) => Promise<RunRecord>

    /**
     * @override
     */
    call: (runName: string, input?: object, options?: ActorCallOptions) => Promise<ActorRun>

    /**
     * Starts and waits for one or more Runs, based on an array of requests.
     */
    callRuns: (...runRequests: ActorRunRequest[]) => Promise<RunRecord>

    /**
     * Starts and waits for one or more requests for new Runs, given the parameters to generate input batches.
     *
     * @param namePrefix the prefix for each Run's name; if just one Run is started, it is the full name
     * @param sources an array used to generate the input batches
     * @param inputGenerator the function used to generate the input batches
     * @param overrideSplitRules the rules for splitting
     * @param options the options for starting the Runs
     * @returns the future names of the Runs
     */
    callBatch: <T>(
        namePrefix: string,
        sources: T[],
        inputGenerator: (chunk: T[]) => object,
        overrideSplitRules?: Partial<SplitRules>,
        options?: ActorStartOptions,
    ) => Promise<RunRecord>

    /**
     * If it finds the Run it in the Runs records, it returns a `TrackedRunClient` instead of a `RunClient`,
     * allowing for tracking an logging Run operations.
     *
     * @override
     */
    lastRun: (options?: ActorLastRunOptions) => RunClient
}

/**
 * A Run Client which tracks and logs any operation regarding the Run.
 *
 * @extends RunClient
 */
export interface TrackedRunClient extends RunClient {}

/**
 * A Dataset client allowing to iterate over the items in the dataset, automatically paginated.
 *
 * @extends DatasetClient
 */
export interface IterableDatasetClient<T extends DatasetItem> extends DatasetClient<T> {
    /**
     * Iterates over the items in the dataset.
     *
     * Using the option `pageSize` will help avoiding the JavaScript's string limit when deserializing the content.
     *
     * @param options includes all the options in `DatasetClientListItemOptions` and `pageSize`
     * @returns an `AsyncGenerator` which iterates the items in the dataset
     */
    iterate: (options: IterateOptions) => AsyncGenerator<T, void, void>
}

/**
 * - `kvs`: will store the values in the Key Value Store
 * - `none`: will keep the values in memory
 */
export type PersistSupport = 'kvs' | 'none'

/**
 * A request to be enqueued by the `QueuedActorClient`.
 */
export interface ActorRunRequest {
    runName: string
    input?: object
    options?: ActorStartOptions
}

/**
 * A record of Runs, having their names as keys and their `ActorRun` objects as values.
 */
export type RunRecord = Record<string, ActorRun>

/**
 * Helps distinguishing between a `RunRecord` and an `ActorRun` in TypeScript.
 */
export function isRunRecord(runRecordOrActorRun: RunRecord | ActorRun): runRecordOrActorRun is RunRecord {
    return Object.values(runRecordOrActorRun).every((run) => typeof run === 'object' && 'defaultDatasetId' in run);
}

/**
 * A generic definition of a dataset item.
 *
 * When defining a custom item interface in TypeScript, you should extend this type:
 *
 * ```js
 * interface MyItem extends DatasetItem {
 *     value: number
 *     timestamp: string
 * }
 * ```
 */
export type DatasetItem = Record<string | number, unknown>

export type IterateOptions = DatasetClientListItemOptions & {
    pageSize?: number
}

export interface SplitRules {
    /**
     * Make so that each input, when serialized, is lower in size than 9,437,184 bytes.
     */
    respectApifyMaxPayloadSize?: boolean
}
