import { type TrySync, TrySyncOutcome } from './try-sync.js';

/**
 * A simple asynchronous lock to prevent concurrent executions of a function.
 */
export class TryLock implements TrySync {
    private isLocked = false;

    /**
     * Acquires the lock, runs the provided function, and releases the lock.
     *
     * If the lock is already acquired, the function is not executed.
     */
    async attempt<T>(fn: () => Promise<T>): Promise<TrySyncOutcome<T>> {
        if (this.isLocked) return new TrySyncOutcome({ blocked: 'lock-held' });
        this.isLocked = true;
        try {
            const result = await fn();
            return new TrySyncOutcome({ executed: result });
        } finally {
            this.isLocked = false;
        }
    }
}
