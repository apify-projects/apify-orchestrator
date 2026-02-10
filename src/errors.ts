/**
 * Base class for all Apify Orchestrator errors
 */
export abstract class OrchestratorError extends Error {
    abstract readonly code: string;
    readonly runName?: string;

    protected constructor(message: string, runName?: string) {
        super(message);
        this.name = this.constructor.name;
        this.runName = runName;
    }
}

/**
 * Error thrown when there's insufficient memory to start a run
 */
export class InsufficientMemoryError extends OrchestratorError {
    readonly code = 'INSUFFICIENT_MEMORY';
    readonly requiredMemoryMBs: number;

    constructor(runName: string, requiredMemoryMBs: number) {
        super(`Insufficient memory to start run '${runName}'. Required: ${requiredMemoryMBs / 1024}GB.`, runName);
        this.requiredMemoryMBs = requiredMemoryMBs;
    }
}

/**
 * Error thrown when there are not enough actor jobs available to start a run
 */
export class InsufficientActorJobsError extends OrchestratorError {
    readonly code = 'INSUFFICIENT_ACTOR_JOBS';

    constructor(runName: string) {
        super(`Insufficient actor jobs to start run '${runName}'.`, runName);
    }
}
