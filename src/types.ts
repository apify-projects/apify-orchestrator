// This file contains all the public type definitions for the Apify Orchestrator package.
// Private types should go elsewhere.

import type {
    ActorCallOptions,
    ActorClient,
    ActorLastRunOptions,
    ActorRun,
    ActorStartOptions,
    ApifyClient,
    ApifyClientOptions,
    DatasetClient,
    DatasetClientListItemOptions,
    Dictionary,
    RunClient,
    TaskCallOptions,
    TaskClient,
    TaskLastRunOptions,
    TaskStartOptions,
} from 'apify-client';

export interface OrchestratorOptions {
    /**
     * @default true
     */
    enableLogs: boolean;

    /**
     * Hide sensitive data from logs, such as Run IDs and URLs.
     *
     * **WARNING**: if you enable persistence without an encryption key,
     * the user will be able to retrieve the hidden data from the Key Value Store.
     *
     * @default true
     */
    hideSensitiveInformation: boolean;

    /**
     * A callback which is called every time the Orchestrator's status is updated.
     *
     * The callback takes as input a record having Run request IDs as keys, and Run information as values.
     */
    onUpdate?: UpdateCallback;

    /**
     * Which support to use for persistence:
     *
     * - `kvs`: Key Value Store
     * - `none`: disable persistence
     *
     * **WARNING**: persistence may leak sensitive information to the user, such as external runs' IDs.
     * If you don't want the information in the Key Value Store to be readable to anyone having access to it,
     * set a `persistenceEncryptionKey`.
     *
     * @default none
     */
    persistenceSupport: PersistenceSupport;

    /**
     * Used to persist data in the Key Value Store.
     *
     * @default ORCHESTRATOR-
     */
    persistencePrefix: string;

    /**
     * Define an encryption key if you desire to use persistence, while still hiding sensitive information from the user.
     *
     * **WARNING**: if you want to hide sensitive information, also set `hideSensitiveInformation` to true,
     * otherwise such information will be still visible through logs.
     *
     * To allow persistency to work correctly, the same key should be provided upon resurrection.
     *
     * @default undefined
     */
    persistenceEncryptionKey?: string;

    /**
     * Some fixed input parameters to add to each Run.
     *
     * @default undefined
     */
    fixedInput?: Dictionary;

    /**
     * Abort all Runs started by the Orchestrator on graceful abort.
     *
     * Notice that, if disabled, a function that is waiting for a Run to finish
     * may not notice when the orchestrator is aborted and will be killed abruptly.
     *
     * @default true
     */
    abortAllRunsOnGracefulAbort: boolean;

    /**
     * Whether to automatically retry failed (due to lack of memory/jobs) operations.
     *
     * When enabled, the orchestrator will attempt to retry if something went wrong.
     *
     * @default true
     */
    retryOnInsufficientResources: boolean;
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
    apifyClient: (options?: ExtendedClientOptions) => Promise<ExtendedApifyClient>;

    /**
     * Group some datasets together, to be able to read all their items at one time.
     *
     * @param datasets the dataset clients, generated with `ExtendedApifyClient.dataset`
     * @returns an object representing group of merged datasets
     */
    mergeDatasets: <T extends DatasetItem>(...datasets: ExtendedDatasetClient<T>[]) => DatasetGroup<T>;
}

export type ExtendedClientOptions = ApifyClientOptions & {
    /**
     * Used to identify a client, for instance, when storing its Runs in the Key Value Store.
     */
    name?: string;
};

/**
 * Starts the Runs through a scheduler.
 *
 * @extends ApifyClient
 */
export interface ExtendedApifyClient extends ApifyClient {
    readonly clientName: string;

    /**
     * @override
     */
    actor: (id: string) => ExtendedActorClient;

    /**
     * @override
     */
    task: (id: string) => ExtendedTaskClient;

    /**
     * @override
     */
    dataset: <T extends DatasetItem>(id: string) => ExtendedDatasetClient<T>;

    /**
     * @param requestIdOrRunName the request ID returned by `enqueue`, for example, or the run name of your choice
     * @returns a Run client corresponding to the given request ID or Run name, if it exists
     */
    runByRequest: (requestIdOrRunName: string) => Promise<ExtendedRunClient | undefined>;

    /**
     * @param requestIdOrRunName the request ID returned by `enqueue`, for example, or the run name of your choice
     * @returns an ExtendedActorRun object corresponding to the given request ID or Run name, if it exists
     */
    actorRunByRequest: (requestIdOrRunName: string) => Promise<ExtendedActorRun | undefined>;

    /**
     * Searches for the Runs with the given request IDs or Run names.
     *
     * @param requestIdsOrRunNames the request IDs returned by `enqueue`, for example, or the run names of your choice
     * @returns the `ExtendedActorRun` objects of the Runs that were found
     */
    actorRunsByRequest: (...requestIdsOrRunNames: string[]) => Promise<ExtendedActorRun[]>;

    /**
     * Waits for one or more Runs previously started.
     *
     * @param batch an array of `ExtendedActorRun` objects or a list of request IDs or Run names
     * @returns the updated `ExtendedActorRun` objects
     */
    waitForBatchFinish: (batch: ExtendedActorRun[] | string[]) => Promise<ExtendedActorRun[]>;

    /**
     * Stop all the Runs in progress started from this client.
     */
    abortAllRuns: () => Promise<void>;
}

export interface ExtendedActorStartOptions extends ActorStartOptions {
    runName?: string;
}

export interface ExtendedActorCallOptions extends ActorCallOptions {
    runName?: string;
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
     * @returns the future request IDs of the Runs
     */
    enqueue: (...runRequests: ActorRunRequest[]) => string[];

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
        inputGenerator: (chunk: T[]) => Dictionary,
        overrideSplitRules?: Partial<SplitRules>,
        options?: ActorStartOptions,
    ) => string[];

    /**
     * @override
     */
    start: (input?: object, options?: ExtendedActorStartOptions) => Promise<ExtendedActorRun>;

    /**
     * Starts one or more Runs, based on an array of requests.
     */
    startRuns: (...runRequests: ActorRunRequest[]) => Promise<ExtendedActorRun[]>;

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
     * @returns the started Runs
     */
    startBatch: <T>(
        namePrefix: string,
        sources: T[],
        inputGenerator: (chunk: T[]) => Dictionary,
        overrideSplitRules?: Partial<SplitRules>,
        options?: ActorStartOptions,
    ) => Promise<ExtendedActorRun[]>;

    /**
     * @override
     */
    call: (input?: object, options?: ExtendedActorCallOptions) => Promise<ExtendedActorRun>;

    /**
     * Starts and waits for one or more Runs, based on an array of requests.
     */
    callRuns: (...runRequests: ActorRunRequest[]) => Promise<ExtendedActorRun[]>;

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
     * @returns the finished Runs
     */
    callBatch: <T>(
        namePrefix: string,
        sources: T[],
        inputGenerator: (chunk: T[]) => Dictionary,
        overrideSplitRules?: Partial<SplitRules>,
        options?: ActorStartOptions,
    ) => Promise<ExtendedActorRun[]>;

    /**
     * If it finds the Run it in the Runs records, it returns a `TrackedRunClient` instead of a `RunClient`,
     * allowing for tracking an logging Run operations.
     *
     * @override
     */
    lastRun: (options?: ActorLastRunOptions) => RunClient | ExtendedRunClient;
}

export interface ExtendedTaskStartOptions extends TaskStartOptions {
    runName?: string;
}

export interface ExtendedTaskCallOptions extends TaskCallOptions {
    runName?: string;
}

/**
 * A Task client which enqueues the requests for new Runs, instead of starting them directly.
 *
 * @extends TaskClient
 */
export interface ExtendedTaskClient extends TaskClient {
    /**
     * Enqueues one or more requests for new Runs, and return immediately.
     *
     * @param runRequests the requests
     * @returns the future names of the Runs
     */
    enqueue: (...runRequests: ActorRunRequest[]) => string[];

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
        inputGenerator: (chunk: T[]) => Dictionary,
        overrideSplitRules?: Partial<SplitRules>,
        options?: TaskStartOptions,
    ) => string[];

    /**
     * @override
     */
    start: (input?: Dictionary, options?: ExtendedTaskStartOptions) => Promise<ExtendedActorRun>;

    /**
     * Starts one or more Runs, based on an array of requests.
     */
    startRuns: (...runRequests: TaskRunRequest[]) => Promise<ExtendedActorRun[]>;

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
     * @returns the started Runs
     */
    startBatch: <T>(
        namePrefix: string,
        sources: T[],
        inputGenerator: (chunk: T[]) => Dictionary,
        overrideSplitRules?: Partial<SplitRules>,
        options?: TaskStartOptions,
    ) => Promise<ExtendedActorRun[]>;

    /**
     * @override
     */
    call: (input?: Dictionary, options?: ExtendedTaskCallOptions) => Promise<ExtendedActorRun>;

    /**
     * Starts and waits for one or more Runs, based on an array of requests.
     */
    callRuns: (...runRequests: TaskRunRequest[]) => Promise<ExtendedActorRun[]>;

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
     * @returns the finished Runs
     */
    callBatch: <T>(
        namePrefix: string,
        sources: T[],
        inputGenerator: (chunk: T[]) => Dictionary,
        overrideSplitRules?: Partial<SplitRules>,
        options?: TaskStartOptions,
    ) => Promise<ExtendedActorRun[]>;

    /**
     * If it finds the Run it in the Runs records, it returns a `TrackedRunClient` instead of a `RunClient`,
     * allowing for tracking an logging Run operations.
     *
     * @override
     */
    lastRun: (options?: TaskLastRunOptions) => RunClient | ExtendedRunClient;
}

/**
 * A Run Client which tracks and logs any operation regarding the Run.
 *
 * @extends RunClient
 */
export type ExtendedRunClient = RunClient;

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
     *
     * @example
     * const datasetIterator = datasetClient.iterate({ pageSize: 100 });
     * for await (const item of datasetIterator) {
     *     console.log(item.title);
     * }
     */
    iterate: (options: IterateOptions) => AsyncGenerator<T, void, void>;

    /**
     * Iterates over the items in the dataset as they become available, polling the run status
     * at a regular interval and yielding any new items found at each poll.
     *
     * The option `pageSize` will help avoiding the JavaScript's string limit when deserializing the content.
     * The default value is 100 items.
     *
     * The option `pollIntervalSecs` allows customizing how frequently to call the API to check for new items.
     * The default value is 10 seconds.
     *
     * Once the run reaches a terminal status, any remaining items are drained page-by-page until
     * no more are returned.
     *
     * @param options includes all the options in `DatasetClientListItemOptions`, `pageSize`, and `pollIntervalSecs`
     * @returns an `AsyncGenerator` which iterates the items in the dataset
     *
     * @example
     * const datasetIterator = datasetClient.greedyIterate({ pageSize: 100 });
     * for await (const item of datasetIterator) {
     *     console.log(item.title);
     * }
     */
    greedyIterate: (options: GreedyIterateOptions) => AsyncGenerator<T, void, void>;
}

export interface DatasetGroup<T extends DatasetItem> {
    /**
     * The dataset clients in this group.
     */
    readonly datasets: ExtendedDatasetClient<T>[];

    /**
     * Iterate over all the items from all the dataset, in order, at one time.
     *
     * The option `pageSize` will help avoiding the JavaScript's string limit when deserializing the content.
     *
     * @param options includes all the options in `DatasetClientListItemOptions` and `pageSize`
     * @returns an `AsyncGenerator` which iterates the items in the datasets
     */
    iterate: (options: IterateOptions) => AsyncGenerator<T, void, void>;
}

/**
 * - `kvs`: will store the values in the Key Value Store
 * - `none`: will keep the values in memory
 */
export type PersistenceSupport = 'kvs' | 'none';

/**
 * A request to be enqueued by the `QueuedActorClient`.
 */
export interface ActorRunRequest {
    runName?: string;
    input?: Dictionary;
    options?: ActorStartOptions;
}

/**
 * A request to be enqueued by the `ExtTaskClient`.
 */
export interface TaskRunRequest {
    runName?: string;
    input?: Dictionary;
    options?: TaskStartOptions;
}

export interface ExtendedActorRun extends ActorRun {
    requestId: string;
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
export type DatasetItem = Record<string | number, unknown>;

export type IterateOptions = DatasetClientListItemOptions & {
    /**
     * Value used for pagination. If omitted, all the items are downloaded together.
     */
    pageSize?: number;
};

export type GreedyIterateOptions = IterateOptions & {
    /**
     * Check the run's status regularly at the specified interval, in seconds.
     *
     * @default 10
     */
    pollIntervalSecs?: number;
};

export interface SplitRules {
    /**
     * Make so that each input, when serialized, is lower in size than 9,437,184 bytes.
     */
    respectApifyMaxPayloadSize?: boolean;
}

export type UpdateCallback = (
    report: Record<string, RunInfo>,
    lastChangedRunRequestId?: string,
    lastChangedRun?: ExtendedActorRun,
) => unknown;

export interface RunInfo {
    runId: string;
    runUrl: string;
    status: string;
    startedAt: string;
}
