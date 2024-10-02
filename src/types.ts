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
     * @default true
     */
    enableLogs: boolean

    /**
     * Hide sensible data from logs, such as Run IDs and URLs.
     *
     * **WARNING**: if you enable persistance without an encryption key,
     * the user will be able to retrieve the hidden data from the Key Value Store.
     *
     * @default true
     */
    hideSensibleInformation: boolean

    /**
     * A callback which is called every time the Orchestrator's status is updated.
     *
     * The callback takes as input a record having Run names as keys, and Run information as values.
     */
    onUpdate?: UpdateCallback

    /**
     * Which support to use for persistance:
     *
     * - `kvs`: Key Value Store
     * - `none`: disable persistance
     *
     * **WARNING**: persistance may leak sensible information to the user, such as external runs' IDs.
     * If you don't want the information in the Key Value Store to be readable to anyone having access to it,
     * set a `persistEncryptionKey`.
     *
     * @default none
     */
    persistSupport: PersistSupport

    /**
     * Used to persist data in the Key Value Store.
     *
     * @default ORCHESTRATOR-
     */
    persistPrefix: string

    /**
     * Define an encryption key if you desire to use persistence, while still hiding sensible information from the user.
     *
     * **WARNING**: if you want to hide sensible information, also set `hideSensibleInformation` to true,
     * otherwise such information will be still visible through logs.
     *
     * To allow persistency to work correctly, the same key should be provided upon resurrection.
     *
     * @default undefined
     */
    persistEncryptionKey?: string

    /**
     * Some fixed input parameters to add to each Run.
     *
     * @default undefined
     */
    fixedInput?: object

    /**
     * Abort all Runs started by the Orchestrator on graceful abort.
     *
     * Notice that, if disabled, a function that is waiting for a Run to finish
     * may not notice when the orchestrator is aborted and will be killed abruptly.
     *
     * @default true
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
    apifyClient: (options?: ExtendedClientOptions) => Promise<ExtendedApifyClient>
}

export type ExtendedClientOptions = ApifyClientOptions & {
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
export interface ExtendedApifyClient extends ApifyClient {
    readonly clientName: string
    readonly abortAllRunsOnGracefulAbort: boolean
    readonly hideSensibleInformation: boolean
    readonly enableDatasetTracking: boolean
    readonly fixedInput: object | undefined

    /**
     * @override
     */
    actor: (id: string) => ExtendedActorClient

    /**
     * @override
     */
    dataset: <T extends DatasetItem>(id: string) => ExtendedDatasetClient<T>

    /**
     * @returns a Run client corresponding to the given name, if it exists
     */
    runByName: (name: string) => Promise<ExtendedRunClient | undefined>

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
export interface ExtendedActorClient extends ActorClient {
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
     * WARNING: with the current implementation, input splitting may be quite slow.
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
     * WARNING: with the current implementation, input splitting may be quite slow.
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
     * WARNING: with the current implementation, input splitting may be quite slow.
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
export interface ExtendedRunClient extends RunClient {}

/**
 * A Dataset client allowing to iterate over the items in the dataset, automatically paginated.
 *
 * @extends DatasetClient
 */
export interface ExtendedDatasetClient<T extends DatasetItem> extends DatasetClient<T> {
    /**
     * Iterates over the items in the dataset.
     *
     * The option `pageSize` will help avoiding the JavaScript's string limit when deserializing the content.
     *
     * @param options includes all the options in `DatasetClientListItemOptions` and `pageSize`
     * @returns an `AsyncGenerator` which iterates the items in the dataset
     */
    iterate: (options: IterateOptions) => AsyncGenerator<T, void, void>

    /**
     * Iterates over the items in the dataset. Fetches the items as soon as they are available
     *
     * The option `pageSize` will help avoiding the JavaScript's string limit when deserializing the content.
     * The default value is 100 items.
     *
     * The option `itemsThreshold` will define the batch size of new items to trigger a fetch.
     * Set to 0 to fetch any amount of new items as soon as they are available.
     * The default value is 100 items.
     *
     * The option `pollIntervalSecs` allows customizing how frequently to call the API to check for new items.
     * The default value is 10 seconds.
     *
     * ### Example
     *
     * With the default settings, this function will check every 10 seconds if at least 100 new items are available.
     * If yes, it will read a "page" of 100 items from the dataset, then resume polling every 10 seconds.
     * If the Run terminates, it will fetch all the remaining items using a pagination of 100 items.
     *
     * @param options includes all the options in `DatasetClientListItemOptions`, `pageSize`, `itemsThreshold`, and `pollIntervalSecs`
     * @returns an `AsyncGenerator` which iterates the items in the dataset
     */
    greedyIterate: (options: GreedyIterateOptions) => AsyncGenerator<T, void, void>
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
    /**
     * Value used for pagination. If omitted, all the items are downloaded together.
     */
    pageSize?: number
}

export type GreedyIterateOptions = IterateOptions & {
    /**
     * Download new items when they are more than the specified threshold, or when the Run terminates.\
     * If zero, the new items are downloaded as soon as they are detected.
     *
     * @default 100
     */
    itemsThreshold?: number
    /**
     * Check the run's status regularly at the specified interval, in seconds.
     *
     * @default 10
     */
    pollIntervalSecs?: number
}

export interface SplitRules {
    /**
     * Make so that each input, when serialized, is lower in size than 9,437,184 bytes.
     */
    respectApifyMaxPayloadSize?: boolean
}

export type UpdateCallback = (status: Record<string, RunInfo>) => unknown

export interface RunInfo {
    runId: string
    runUrl: string
    status: string
    startedAt: string
    itemsCount: number
}
