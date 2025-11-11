import { ApifyApiError } from 'apify-client';
import type { AxiosResponse } from 'axios';
import { InsufficientActorJobsError, InsufficientMemoryError } from 'src/errors.js';
import {
    CONCURRENT_RUNS_LIMIT_EXCEEDED_ERROR_TYPE,
    MEMORY_LIMIT_EXCEEDED_ERROR_TYPE,
    parseStartRunError,
} from 'src/utils/apify-client.js';

function createMockApifyApiError(type: string) {
    return new ApifyApiError(
        {
            data: {
                error: {
                    type,
                },
            },
        } as AxiosResponse,
        1,
    );
}

async function dummyGetRequiredMemoryMbytes() {
    return 512;
}

describe('utils/apify-client', () => {
    describe('parseStartRunError', () => {
        it('returns InsufficientMemoryError for MEMORY_LIMIT_EXCEEDED_ERROR_TYPE', async () => {
            const error = createMockApifyApiError(MEMORY_LIMIT_EXCEEDED_ERROR_TYPE);
            const parsedError = await parseStartRunError(error, 'test-run', dummyGetRequiredMemoryMbytes);
            expect(parsedError).toBeInstanceOf(InsufficientMemoryError);
        });

        it('returns InsufficientActorJobsError for CONCURRENT_RUNS_LIMIT_EXCEEDED_ERROR_TYPE', async () => {
            const error = createMockApifyApiError(CONCURRENT_RUNS_LIMIT_EXCEEDED_ERROR_TYPE);
            const parsedError = await parseStartRunError(error, 'test-run', dummyGetRequiredMemoryMbytes);
            expect(parsedError).toBeInstanceOf(InsufficientActorJobsError);
        });

        it('returns the original error if it is not an ApifyApiError', async () => {
            const originalError = new Error('Some other error');
            const parsedError = await parseStartRunError(originalError, 'test-run', dummyGetRequiredMemoryMbytes);
            expect(parsedError).toBe(originalError);
        });

        it('returns a generic Error for unknown error types', async () => {
            const unknownError = { message: 'Unknown error' };
            const parsedError = await parseStartRunError(unknownError, 'test-run', dummyGetRequiredMemoryMbytes);
            expect(parsedError).toBeInstanceOf(Error);
            expect(parsedError.message).toContain('Unknown error occurred while starting the run: test-run');
        });
    });
});
