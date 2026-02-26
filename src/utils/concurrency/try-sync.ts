import { Outcome } from '../outcome.js';

type TrySyncOutcomeVariants<T> = { executed: T; blocked: string };

export class TrySyncOutcome<T> extends Outcome<TrySyncOutcomeVariants<T>> {}

/**
 * A synchronization primitive that can execute or block a critical section.
 */
export interface TrySync {
    /**
     * @returns an Outcome object holding the value returned by the critical section,
     * or an error if the critical section could not be executed.
     */
    attempt<T>(fn: () => Promise<T>): Promise<TrySyncOutcome<T>>;
}

/**
 * Attempts running a function within multiple synchronization primitives.
 *
 * @returns an Outcome object holding the value returned by the function,
 * or an identifier of the synchronizer that blocked the execution.
 */
export async function synchronizedAttempt<T>(
    fn: () => Promise<T>,
    synchronizers: TrySync[],
): Promise<TrySyncOutcome<T>> {
    // If there are no more synchronizers to acquire, run the given function.
    if (synchronizers.length === 0) {
        const result: T = await fn();
        return new TrySyncOutcome({ executed: result });
    }

    // Acquire the first synchronizer, then recursively acquire the rest.
    const [first, ...rest] = synchronizers;
    const result = await first.attempt(async () => await synchronizedAttempt(fn, rest));

    // Propagate the acquisition result.
    return result.match({
        executed: (value) => value,
        blocked: (reason) => new TrySyncOutcome({ blocked: reason }),
    });
}
