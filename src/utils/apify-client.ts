import { ApifyApiError } from 'apify-client';

export const MEMORY_LIMIT_EXCEEDED_ERROR_TYPE = 'actor-memory-limit-exceeded';
export const CONCURRENT_RUNS_LIMIT_EXCEEDED_ERROR_TYPE = 'concurrent-runs-limit-exceeded';

export const START_RUN_ERROR_TYPE = {
    MEMORY: Symbol('memory'),
    CONCURRENT_RUNS: Symbol('concurrent-runs'),
    OTHER: Symbol('other'),
} as const;

export type StartRunErrorType = (typeof START_RUN_ERROR_TYPE)[keyof typeof START_RUN_ERROR_TYPE];

/**
 * Identifies known error types, from the Apify client, when starting a run.
 */
export function getStartRunErrorType(error: unknown): StartRunErrorType {
    if (error instanceof ApifyApiError) {
        if (error.type === MEMORY_LIMIT_EXCEEDED_ERROR_TYPE) {
            return START_RUN_ERROR_TYPE.MEMORY;
        }
        if (error.type === CONCURRENT_RUNS_LIMIT_EXCEEDED_ERROR_TYPE) {
            return START_RUN_ERROR_TYPE.CONCURRENT_RUNS;
        }
    }
    return START_RUN_ERROR_TYPE.OTHER;
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

// Statuses of Runs which have reached their end: such Runs no longer take up resources on the platform.
// `ABORTING` and `TIMING-OUT` are intentionally excluded, as those Runs still occupy an Actor job.
const TERMINAL_STATUSES = ['SUCCEEDED', 'FAILED', 'ABORTED', 'TIMED-OUT'] as const;

type RunTerminalStatus = (typeof TERMINAL_STATUSES)[number];

/**
 * Notice that an unknown status is never considered terminal: when in doubt, a Run is assumed
 * to be still taking up resources.
 */
export function isRunTerminalStatus(status: string): status is RunTerminalStatus {
    return TERMINAL_STATUSES.includes(status as RunTerminalStatus);
}
