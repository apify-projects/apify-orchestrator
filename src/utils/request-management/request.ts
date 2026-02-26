import { DeferredPromise } from '../concurrency/deferred-promise.js';
import { Outcome } from '../outcome.js';

type RequestOutcomeVariants<T> = {
    success: T;
    failure: unknown;
    retry: unknown;
};

export class RequestOutcome<T> extends Outcome<RequestOutcomeVariants<T>> {}

export type RequestProcessor<RequestType, ResultType> = (data: RequestType) => Promise<RequestOutcome<ResultType>>;

export interface RequestOptions<ResultType> {
    onSuccess: (value: ResultType) => void;
    onFailure: (error: unknown) => void;
    onRetry: (reason: unknown) => void;
}

export class Request<RequestType, ResultType> {
    private pending = true;
    private readonly promise = new DeferredPromise<ResultType>();
    private readonly requestData: RequestType;
    private readonly options: RequestOptions<ResultType>;

    constructor(requestData: RequestType, options: RequestOptions<ResultType>) {
        this.requestData = requestData;
        this.options = options;
    }

    async wait(): Promise<ResultType> {
        return this.promise.wait();
    }

    isPending(): boolean {
        return this.pending;
    }

    /**
     * Prevents processing the request multiple times, unless retried.
     */
    async process(processor: RequestProcessor<RequestType, ResultType>): Promise<void> {
        if (!this.pending) return; // already processed or being processed

        this.pending = false; // indicate that the request is being processed

        const outcome = await processor(this.requestData);

        outcome.match({
            success: (value) => {
                this.options.onSuccess(value);
                this.promise.resolve(value);
            },
            failure: (error) => {
                this.options.onFailure(error);
                this.promise.reject(error);
            },
            retry: (reason) => {
                this.options.onRetry(reason);
                this.pending = true; // mark as ready to be processed again
            },
        });
    }
}
