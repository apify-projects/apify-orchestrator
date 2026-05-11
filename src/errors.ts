import { isDefined } from './utils/typing.js';

/**
 * Base class for all Apify Orchestrator errors
 */
export abstract class OrchestratorError extends Error {
    abstract readonly code: string;
    readonly requestId?: string;

    protected constructor(message: string, requestId?: string) {
        super(message);
        this.name = this.constructor.name;
        this.requestId = requestId;
    }
}

/**
 * Error thrown when there's insufficient memory to start a run
 */
export class InsufficientMemoryError extends OrchestratorError {
    readonly code = 'INSUFFICIENT_MEMORY';
    readonly requiredMemoryMBs?: number;

    constructor(requestId: string, requiredMemoryMBs?: number) {
        const requiredMemoryText = isDefined(requiredMemoryMBs) ? `${requiredMemoryMBs / 1024}GB` : 'unknown';
        super(`Insufficient memory to start run '${requestId}'. Required memory: ${requiredMemoryText}.`, requestId);
        this.requiredMemoryMBs = requiredMemoryMBs;
    }
}

/**
 * Error thrown when there are not enough actor jobs available to start a run
 */
export class InsufficientActorJobsError extends OrchestratorError {
    readonly code = 'INSUFFICIENT_ACTOR_JOBS';

    constructor(requestId: string) {
        super(`Insufficient actor jobs to start run '${requestId}'.`, requestId);
    }
}

export function isInsufficientResourcesError(
    error: unknown,
): error is InsufficientMemoryError | InsufficientActorJobsError {
    return error instanceof InsufficientMemoryError || error instanceof InsufficientActorJobsError;
}
