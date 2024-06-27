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

export type PersistSupport = 'kvs' | 'none'

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

export type ScheduledClientOptions = ApifyClientOptions & {
    name?: string
}

export interface ScheduledApifyClient extends ApifyClient {
    // Overrides
    actor: (id: string) => QueuedActorClient
    dataset: <T extends DatasetItem>(id: string) => IterableDatasetClient<T>

    runByName: (name: string) => Promise<TrackedRunClient | undefined>

    actorRunByName: (name: string) => Promise<ActorRun | undefined>

    runRecord: (...runNames: string[]) => Promise<RunRecord>

    waitForBatchFinish: (batch: RunRecord | string[]) => Promise<RunRecord>

    abortAllRuns: () => Promise<void>

    iterateOutput: <T extends DatasetItem>(resource: ActorRun | RunRecord, options: IterateOptions) => AsyncGenerator<T, void, void>
}

export interface QueuedActorClient extends ActorClient {
    enqueue: (...runRequests: ActorRunRequest[]) => string[]

    enqueueBatch: <T>(
        namePrefix: string,
        sources: T[],
        inputGenerator: (chunk: T[]) => object,
        overrideSplitRules?: Partial<SplitRules>,
        options?: ActorStartOptions,
    ) => string[]

    start: (runName: string, input?: object, options?: ActorStartOptions) => Promise<ActorRun>

    startRuns: (...runRequests: ActorRunRequest[]) => Promise<RunRecord>

    startBatch: <T>(
        namePrefix: string,
        sources: T[],
        inputGenerator: (chunk: T[]) => object,
        overrideSplitRules?: Partial<SplitRules>,
        options?: ActorStartOptions,
    ) => Promise<RunRecord>

    call: (runName: string, input?: object, options?: ActorCallOptions) => Promise<ActorRun>

    callRuns: (...runRequests: ActorRunRequest[]) => Promise<RunRecord>

    callBatch: <T>(
        namePrefix: string,
        sources: T[],
        inputGenerator: (chunk: T[]) => object,
        overrideSplitRules?: Partial<SplitRules>,
        options?: ActorStartOptions,
    ) => Promise<RunRecord>

    lastRun: (options?: ActorLastRunOptions) => RunClient
}

export interface TrackedRunClient extends RunClient {}

export interface IterableDatasetClient<T extends DatasetItem> extends DatasetClient<T> {
    iterate: (options: IterateOptions) => AsyncGenerator<T, void, void>
}

export interface ActorRunRequest {
    runName: string
    input?: object
    options?: ActorStartOptions
}

export type RunRecord = Record<string, ActorRun>

export function isRunRecord(runRecordOrActorRun: RunRecord | ActorRun): runRecordOrActorRun is RunRecord {
    return Object.values(runRecordOrActorRun).every((run) => 'defaultDatasetId' in run);
}

export type DatasetItem = Record<string | number, unknown>

export type IterateOptions = DatasetClientListItemOptions & {
    pageSize?: number
}

export interface SplitRules {
    respectApifyMaxPayloadSize?: boolean
}
