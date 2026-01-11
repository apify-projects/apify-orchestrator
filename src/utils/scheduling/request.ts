import { DeferredPromise } from '../concurrency/deferred-promise.js';
import type { RequestProcessor } from './request-outcome.js';

enum RequestStatus {
    Pending,
    InProgress,
}

export interface ScheduledRequestOptions<ResultType> {
    onSuccess: (value: ResultType) => void;
    onFailure: (error: unknown) => void;
    onRetry: (reason: unknown) => void;
}

export class ScheduledRequest<RequestType, ResultType> {
    private status = RequestStatus.Pending;
    private readonly promise: DeferredPromise<ResultType> = new DeferredPromise<ResultType>();

    constructor(
        private readonly data: RequestType,
        private readonly options: ScheduledRequestOptions<ResultType>,
    ) {}

    async wait(): Promise<ResultType> {
        return this.promise.wait();
    }

    isPending(): boolean {
        return this.status === RequestStatus.Pending;
    }

    async process(processor: RequestProcessor<RequestType, ResultType>): Promise<void> {
        this.status = RequestStatus.InProgress;
        const outcome = await processor(this.data);
        outcome.match({
            success: (value: ResultType) => {
                this.options.onSuccess(value);
                this.promise.resolve(value);
            },
            failure: (error: unknown) => {
                this.options.onFailure(error);
                this.promise.reject(error);
            },
            retry: (reason: unknown) => {
                this.options.onRetry(reason);
                this.status = RequestStatus.Pending;
            },
        });
    }
}
