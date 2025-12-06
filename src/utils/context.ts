import type { RunsTracker } from '../tracker.js';
import type { Logger } from './logging.js';

export interface OrchestratorContext {
    logger: Logger;
    runsTracker: RunsTracker;
}

export interface GlobalContext {
    logger: Logger;
}
