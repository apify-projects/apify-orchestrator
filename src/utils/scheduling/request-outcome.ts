import { Outcome } from '../outcome.js';

type RequestOutcomeVariants<T> = {
    success: T;
    failure: unknown;
    retry: unknown;
};

export class RequestOutcome<T> extends Outcome<RequestOutcomeVariants<T>> {
    private constructor(
        tag: keyof RequestOutcomeVariants<T>,
        value: RequestOutcomeVariants<T>[keyof RequestOutcomeVariants<T>],
    ) {
        super(tag, value);
    }

    static success<T>(value: T): RequestOutcome<T> {
        return new RequestOutcome<T>('success', value);
    }

    static failure<T>(error: unknown): RequestOutcome<T> {
        return new RequestOutcome<T>('failure', error);
    }

    static retry<T>(reason: unknown): RequestOutcome<T> {
        return new RequestOutcome<T>('retry', reason);
    }
}

/**
 * A function that processes a request and returns an outcome object.
 *
 * @example
 * ```ts
 * const processor: RequestProcessor<MyRequestType, MyResultType> = async (request) => {
 *     try {
 *         const result = await doSomethingWithRequest(request);
 *         return RequestHandler.success(result);
 *     } catch (error) {
 *         if (shouldRetry(error)) {
 *             return RequestHandler.retry(error);
 *         }
 *         return RequestHandler.failure(error);
 *     }
 * };
 * ```
 */
export type RequestProcessor<RequestType, ResultType> = (request: RequestType) => Promise<RequestOutcome<ResultType>>;
