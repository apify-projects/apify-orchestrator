import type { RunTracker } from '../run-tracker.js';
import type { Logger } from './logging.js';

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
}
