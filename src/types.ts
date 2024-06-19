import { ActorRun } from 'apify-client';

import { PersistSupport } from './utils/persist.js';

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

export type RunRecord = Record<string, ActorRun | null>

export type DatasetItem = Record<string | number, unknown>

export interface SplitRules {
    respectApifyMaxPayloadSize?: boolean
}
