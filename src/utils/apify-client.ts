import { ApifyApiError } from 'apify-client';

import { InsufficientActorJobsError, InsufficientMemoryError } from '../errors.js';

export const MEMORY_LIMIT_EXCEEDED_ERROR_TYPE = 'actor-memory-limit-exceeded';
export const CONCURRENT_RUNS_LIMIT_EXCEEDED_ERROR_TYPE = 'concurrent-runs-limit-exceeded';

export async function parseStartRunError(
    error: unknown,
    runName: string,
    getRequiredMemoryMbytes: () => Promise<number>,
): Promise<Error> {
    if (error instanceof ApifyApiError) {
        if (error.type === MEMORY_LIMIT_EXCEEDED_ERROR_TYPE) {
            return new InsufficientMemoryError(runName, await getRequiredMemoryMbytes());
        }
        if (error.type === CONCURRENT_RUNS_LIMIT_EXCEEDED_ERROR_TYPE) {
            return new InsufficientActorJobsError(runName);
        }
    }
    if (error instanceof Error) {
        return error;
    }
    return new Error(`Unknown error occurred while starting the run: ${runName}`);
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
