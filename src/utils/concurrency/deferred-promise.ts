/* eslint-disable max-classes-per-file */

import { Outcome } from '../outcome.js';

class PromiseOutcome<T> extends Outcome<{ resolved: T; rejected: unknown }> {}

interface PromiseHandlers<T> {
    resolve: (value: T) => void;
    reject: (error?: unknown) => void;
}

function endPromise<T>(handlers: PromiseHandlers<T>, outcome: PromiseOutcome<T>): void {
    outcome.match({
        resolved: (value) => handlers.resolve(value),
        rejected: (error) => handlers.reject(error),
    });
}

/**
 * A promise that can be resolved or rejected externally.
 */
export class DeferredPromise<T> {
    private outcome?: PromiseOutcome<T>;
    private promise?: Promise<T>;
    private handlers?: PromiseHandlers<T>;

    /**
     * Waits for the promise to be resolved or rejected.
     *
     * It can be called **multiple times** by different consumers, even **after** the promise is resolved.
     */
    async wait(): Promise<T> {
        // If the promise was not created yet, this is the first waiter.
        this.promise ??= new Promise<T>((resolve, reject) => {
            if (this.outcome) {
                // If already resolved/rejected, use the stored outcome.
                endPromise({ resolve, reject }, this.outcome);
            } else {
                // Otherwise, store the handlers for future resolution/rejection.
                this.handlers = { resolve, reject };
            }
        });
        return await this.promise;
    }

    /**
     * Stores the resolved value and notifies all waiters.
     *
     * Like with the built-in Promise, resolving or rejecting multiple times has no effect.
     */
    resolve(value: T): void {
        if (this.outcome) return;
        this.processOutcome(new PromiseOutcome('resolved', value));
    }

    /**
     * Stores the rejection reason and notifies all waiters.
     *
     * Like with the built-in Promise, resolving or rejecting multiple times has no effect.
     */
    reject(error?: unknown): void {
        if (this.outcome) return;
        this.processOutcome(new PromiseOutcome('rejected', error));
    }

    private processOutcome(outcome: PromiseOutcome<T>): void {
        // Store the outcome for future access
        this.outcome = outcome;

        // If anyone is already waiting, notify them
        if (this.handlers) {
            endPromise(this.handlers, outcome);
        }
    }
}
