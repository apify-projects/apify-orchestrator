import { ApifyApiError } from 'apify-client';
import { InsufficientActorJobsError, InsufficientMemoryError } from 'src/errors.js';

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
