import type { RunTracker } from '../tracking/run-tracker.js';
import type { Logger } from './logging.js';
import type { Storage } from './storage.js';

/**
 * @deprecated `runTracker` should not be in the global context, because there is one tracker per Apify client.
 * TODO: Remove or replace.
 */
export interface OrchestratorContext {
    logger: Logger;
    runTracker: RunTracker;
}

export interface GlobalContext {
    logger: Logger;
    storage?: Storage;
}
