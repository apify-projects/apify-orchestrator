import { ApifyApiError } from 'apify-client';

export const MEMORY_LIMIT_EXCEEDED_ERROR_TYPE = 'actor-memory-limit-exceeded';
export const CONCURRENT_RUNS_LIMIT_EXCEEDED_ERROR_TYPE = 'concurrent-runs-limit-exceeded';

export enum StartRunErrorType {
    Memory,
    ConcurrentRuns,
    Other,
}

/**
 * Identifies known error types, from the Apify client, when starting a run.
 */
export function getStartRunErrorType(error: unknown): StartRunErrorType {
    if (error instanceof ApifyApiError) {
        if (error.type === MEMORY_LIMIT_EXCEEDED_ERROR_TYPE) {
            return StartRunErrorType.Memory;
        }
        if (error.type === CONCURRENT_RUNS_LIMIT_EXCEEDED_ERROR_TYPE) {
            return StartRunErrorType.ConcurrentRuns;
        }
    }
    return StartRunErrorType.Other;
}

// We define both OK and FAIL statuses for better type safety: an unknown status is neither.
const OK_STATUSES = ['READY', 'RUNNING', 'SUCCEEDED'] as const;
const FAIL_STATUSES = ['FAILED', 'ABORTING', 'ABORTED', 'TIMING-OUT', 'TIMED-OUT'] as const;

type RunOkStatus = (typeof OK_STATUSES)[number];
type RunFailStatus = (typeof FAIL_STATUSES)[number];

export function isRunOkStatus(status: string): status is RunOkStatus {
    return OK_STATUSES.includes(status as RunOkStatus);
}

export function isRunFailStatus(status: string): status is RunFailStatus {
    return FAIL_STATUSES.includes(status as RunFailStatus);
}
