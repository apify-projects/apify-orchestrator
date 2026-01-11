import { Outcome } from '../outcome.js';

type TrySyncOutcomeVariants<T> = { executed: T; blocked: unknown };

export class TrySyncOutcome<T> extends Outcome<TrySyncOutcomeVariants<T>> {
    private constructor(
        tag: keyof TrySyncOutcomeVariants<T>,
        value: TrySyncOutcomeVariants<T>[keyof TrySyncOutcomeVariants<T>],
    ) {
        super(tag, value);
    }

    static executed<T>(value: T): TrySyncOutcome<T> {
        return new TrySyncOutcome<T>('executed', value);
    }

    static blocked<T>(reason: unknown): TrySyncOutcome<T> {
        return new TrySyncOutcome<T>('blocked', reason);
    }
}

/**
 * A synchronization primitive that can execute or block a critical section.
 */
export interface TrySync {
    /**
     * @returns an Outcome object holding the value returned by the critical section,
     * or an error if the critical section could not be executed.
     */
    attempt<T>(criticalSection: () => Promise<T>): Promise<TrySyncOutcome<T>>;
}

export async function synchronizedAttempt<T>(
    criticalSection: () => Promise<T>,
    synchronizers: TrySync[],
): Promise<TrySyncOutcome<T>> {
    // If there are no more synchronizers to acquire, run the given function.
    if (synchronizers.length === 0) {
        const result: T = await criticalSection();
        return TrySyncOutcome.executed(result);
    }

    // Acquire the first synchronizer, then recursively acquire the rest.
    const [first, ...rest] = synchronizers;
    const result = await first.attempt(async () => await synchronizedAttempt(criticalSection, rest));

    // Propagate the acquisition result.
    return result.match({
        executed: (value) => value,
        blocked: (reason) => TrySyncOutcome.blocked(reason),
    });
}
