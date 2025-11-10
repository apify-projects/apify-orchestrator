import type { RunsTracker } from '../tracker.js';
import type { CustomLogger } from './logging.js';

export interface OrchestratorContext {
    logger: CustomLogger;
    runsTracker: RunsTracker;
}
