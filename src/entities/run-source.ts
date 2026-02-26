import type { ActorRun, ActorStartOptions, Dictionary, TaskStartOptions } from 'apify-client';

import { InsufficientActorJobsError, InsufficientMemoryError } from '../errors.js';
import { getStartRunErrorType, START_RUN_ERROR_TYPE } from '../utils/apify-client.js';

type StartFunction = (input?: Dictionary, options?: RunStartOptions) => Promise<ActorRun>;
type DefaultMemoryFunction = () => Promise<number | undefined>;

export type RunStartOptions = ActorStartOptions | TaskStartOptions;

/**
 * An entity that can start Runs.
 */
export class RunSource {
    public readonly start: StartFunction;
    private readonly defaultMemoryMbytes: DefaultMemoryFunction;

    constructor(start: StartFunction, defaultMemoryMbytes: DefaultMemoryFunction) {
        this.start = start;
        this.defaultMemoryMbytes = defaultMemoryMbytes;
    }

    async parseRunStartError(error: unknown, runName: string, options?: RunStartOptions): Promise<unknown> {
        const errorType = getStartRunErrorType(error);
        if (errorType === START_RUN_ERROR_TYPE.MEMORY) {
            const requiredMemoryMbytes = await this.requiredMemoryMbytes(options);
            return new InsufficientMemoryError(runName, requiredMemoryMbytes);
        }
        if (errorType === START_RUN_ERROR_TYPE.CONCURRENT_RUNS) {
            return new InsufficientActorJobsError(runName);
        }
        return error;
    }

    private async requiredMemoryMbytes(options?: RunStartOptions): Promise<number | undefined> {
        return options?.memory ?? (await this.defaultMemoryMbytes());
    }
}
