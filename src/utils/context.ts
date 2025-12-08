import type { RunTracker } from '../tracking/run-tracker.js';
import type { Logger } from './logging.js';
import type { Storage } from './storage.js';

export interface OrchestratorContext {
    logger: Logger;
    runTracker: RunTracker;
}

export interface GlobalContext {
    logger: Logger;
    storage?: Storage;
}
