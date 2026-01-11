/* eslint-disable max-classes-per-file */
/**
 * Base class for all Apify Orchestrator errors
 */
export abstract class OrchestratorError extends Error {
    abstract readonly code: string;

    protected constructor(
        message: string,
        public readonly runName?: string,
    ) {
        super(message);
        this.name = this.constructor.name;
    }
}

/**
 * Error thrown when there's insufficient memory to start a run
 */
export class InsufficientMemoryError extends OrchestratorError {
    readonly code = 'INSUFFICIENT_MEMORY';

    constructor(
        runName: string,
        public readonly requiredMemoryMBs?: number,
    ) {
        const requiredMemoryText = requiredMemoryMBs ? `${requiredMemoryMBs / 1024}GB` : 'unknown';
        super(`Insufficient memory to start run '${runName}'. Required memory: ${requiredMemoryText}.`, runName);
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

export function isInsufficientResourcesError(
    error: unknown,
): error is InsufficientMemoryError | InsufficientActorJobsError {
    return error instanceof InsufficientMemoryError || error instanceof InsufficientActorJobsError;
}
