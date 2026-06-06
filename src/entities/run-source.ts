import type { ActorRun, ActorStartOptions, Dictionary, TaskStartOptions } from 'apify-client';

import { InsufficientActorJobsError, InsufficientMemoryError } from '../errors.js';
import { getStartRunErrorType, START_RUN_ERROR_TYPE } from '../utils/apify-client.js';
import { hashObject } from '../utils/hash.js';

type StartFunction = (input?: Dictionary, options?: RunStartOptions) => Promise<ActorRun>;
type DefaultMemoryFunction = () => Promise<number | undefined>;

export type RunStartOptions = ActorStartOptions | TaskStartOptions;

export interface RunSourceOptions {
    type: string;
    id?: string;
    start: StartFunction;
    defaultMemoryMbytes?: DefaultMemoryFunction;
}

/**
 * An entity that can start Runs.
 */
export class RunSource {
    public readonly type: string;
    public readonly id?: string;
    public readonly start: StartFunction;
    private readonly defaultMemoryMbytes: DefaultMemoryFunction;

    constructor(options: RunSourceOptions) {
        this.type = options.type;
        this.id = options.id;
        this.start = options.start;
        this.defaultMemoryMbytes = options.defaultMemoryMbytes ?? (async () => undefined);
    }

    getRequestId(input?: unknown, options?: unknown, runName?: string): string {
        if (runName) return runName;
        return hashObject({ sourceType: this.type, sourceId: this.id, input, options });
    }

    async parseRunStartError(error: unknown, requestId: string, options?: RunStartOptions): Promise<unknown> {
        const errorType = getStartRunErrorType(error);
        if (errorType === START_RUN_ERROR_TYPE.MEMORY) {
            const requiredMemoryMbytes = await this.requiredMemoryMbytes(options);
            return new InsufficientMemoryError(requestId, requiredMemoryMbytes);
        }
        if (errorType === START_RUN_ERROR_TYPE.CONCURRENT_RUNS) {
            return new InsufficientActorJobsError(requestId);
        }
        return error;
    }

    private async requiredMemoryMbytes(options?: RunStartOptions): Promise<number | undefined> {
        return options?.memory ?? (await this.defaultMemoryMbytes());
    }
}
