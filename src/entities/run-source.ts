import type { ActorRun, ActorStartOptions, Dictionary, TaskStartOptions } from 'apify-client';

import { InsufficientActorJobsError, InsufficientMemoryError } from '../errors.js';
import { getStartRunErrorType, StartRunErrorType } from '../utils/apify-client.js';

export type RunStartOptions = ActorStartOptions | TaskStartOptions;

/**
 * An entity that can start Runs.
 */
export class RunSource {
    constructor(
        public readonly start: (input?: Dictionary, options?: RunStartOptions) => Promise<ActorRun>,
        private readonly defaultMemoryMbytes: () => Promise<number | undefined>,
    ) {}

    async parseRunStartError(error: unknown, runName: string, options?: RunStartOptions): Promise<unknown> {
        const errorType = getStartRunErrorType(error);
        if (errorType === StartRunErrorType.Memory) {
            const requiredMemoryMbytes = await this.requiredMemoryMbytes(options);
            return new InsufficientMemoryError(runName, requiredMemoryMbytes);
        }
        if (errorType === StartRunErrorType.ConcurrentRuns) {
            return new InsufficientActorJobsError(runName);
        }
        return error;
    }

    private async requiredMemoryMbytes(options?: RunStartOptions): Promise<number | undefined> {
        return options?.memory ?? (await this.defaultMemoryMbytes());
    }
}
