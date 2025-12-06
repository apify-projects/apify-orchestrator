import type { RunTracker } from '../tracker.js';
import type { Logger } from './logging.js';

export interface OrchestratorContext {
    logger: Logger;
    runTracker: RunTracker;
}

export interface GlobalContext {
    logger: Logger;
}
