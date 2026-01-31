import { Request } from './request.js';

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
    private readonly requestsMap: Map<string, Request<RequestType, ResultType>> = new Map();
    private readonly options: RequestPoolOptions<RequestType, ResultType>;

    constructor(options: RequestPoolOptions<RequestType, ResultType>) {
        this.options = options;
    }

    /**
     * @returns all currently pending requests in the pool, framed as an array at the time of the call.
     */
    getPendingRequests(): Request<RequestType, ResultType>[] {
        return Array.from(this.requestsMap.values()).filter((req) => req.isPending());
    }

    findRequest(requestKey: string): Request<RequestType, ResultType> | undefined {
        return this.requestsMap.get(requestKey);
    }

    findOrAddRequest(requestKey: string, requestData: RequestType): Request<RequestType, ResultType> {
        const existingRequest = this.requestsMap.get(requestKey);
        if (existingRequest) return existingRequest;

        const newRequest = new Request<RequestType, ResultType>(requestData, {
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

        this.requestsMap.set(requestKey, newRequest);
        this.options.onRequestAdded(requestKey, requestData);

        return newRequest;
    }
}
