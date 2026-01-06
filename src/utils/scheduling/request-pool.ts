import type { TrySync } from '../concurrency/try-sync.js';
import { synchronizedAttempt } from '../concurrency/try-sync.js';
import { ScheduledRequest } from './request.js';
import type { RequestProcessor } from './request-outcome.js';

type RequestEntry<RequestType, ResultType> = { requestKey: string; request: ScheduledRequest<RequestType, ResultType> };

export interface RequestPoolOptions<RequestType, ResultType> {
    onRequestAdded: (requestKey: string, requestData: RequestType) => void;
    onRequestSuccess: (requestKey: string, requestData: ResultType) => void;
    onRequestFailure: (requestKey: string, error: unknown) => void;
    onRequestRetried: (requestKey: string, reason: unknown) => void;
}

/**
 * A pool that manages requests of a given type, ensuring that each request is processed only once,
 * and providing a way to process requests one by one.
 */
export class RequestPool<RequestType, ResultType> {
    private readonly requestsMap: Map<string, ScheduledRequest<RequestType, ResultType>> = new Map();

    constructor(private readonly options: RequestPoolOptions<RequestType, ResultType>) {}

    /**
     * @returns the promise to wait for the request's result, or `undefined` if the request was not found.
     */
    findRequest(requestKey: string): (() => Promise<ResultType>) | undefined {
        const request = this.requestsMap.get(requestKey);
        return request ? async () => request.wait() : undefined;
    }

    /**
     * @returns the promise to wait for the request's result.
     */
    findOrAddRequest(requestKey: string, requestData: RequestType): () => Promise<ResultType> {
        const existingRequest = this.requestsMap.get(requestKey);
        if (existingRequest) return async () => existingRequest.wait();

        const newRequest = this.generateRequest(requestKey, requestData);
        this.requestsMap.set(requestKey, newRequest);
        this.options.onRequestAdded(requestKey, requestData);
        return async () => newRequest.wait();
    }

    private generateRequest(requestKey: string, requestData: RequestType): ScheduledRequest<RequestType, ResultType> {
        return new ScheduledRequest<RequestType, ResultType>(requestData, {
            onSuccess: (value: ResultType) => {
                this.requestsMap.delete(requestKey); // free up the key
                this.options.onRequestSuccess(requestKey, value);
            },
            onFailure: (error: unknown) => {
                this.requestsMap.delete(requestKey); // free up the key
                this.options.onRequestFailure(requestKey, error);
            },
            onRetry: (reason: unknown) => {
                this.options.onRequestRetried(requestKey, reason);
            },
        });
    }

    /**
     * Tries to process all pending requests in the pool, using the provided `processor` function,
     * while acquiring the provided `synchronizers`.
     *
     * After processing, each request is **removed** from the pool if it was resolved or rejected, so the key is freed
     * up, and can be used for new requests. If it was **retried**, the request will be processed again.
     */
    async attemptProcessingAllRequests(
        processor: RequestProcessor<RequestType, ResultType>,
        synchronizers: TrySync[],
    ): Promise<void> {
        let stillProcessing: boolean;
        do {
            const processingAttempt = await synchronizedAttempt(
                async () => this.processNextPendingRequest(processor),
                synchronizers,
            );
            stillProcessing = processingAttempt.match({
                executed: (processed) => processed,
                blocked: () => false,
            });
        } while (stillProcessing);
    }

    /**
     * @returns `true` if a request was processed, `false` otherwise.
     */
    private async processNextPendingRequest(processor: RequestProcessor<RequestType, ResultType>): Promise<boolean> {
        const next = this.getNextPendingRequest();
        if (next) {
            await next.request.process(processor);
            return true;
        }
        return false;
    }

    private getNextPendingRequest(): RequestEntry<RequestType, ResultType> | undefined {
        for (const [requestKey, request] of this.requestsMap.entries()) {
            if (request.isPending()) {
                return { requestKey, request };
            }
        }
        return undefined;
    }
}
