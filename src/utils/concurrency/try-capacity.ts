import { type TrySync, TrySyncOutcome } from './try-sync.js';

/**
 * A capacity limiter which blocks the execution of a function when a fixed limit has been reached.
 *
 * The amount of capacity currently in use is not tracked internally, but read from an external source
 * every time an attempt is made: the caller is responsible for keeping that source up to date.
 */
export class TryCapacity implements TrySync {
    private readonly limit: number;
    private readonly countInUse: () => number;

    /**
     * @param limit the maximum amount of capacity that can be in use at the same time
     * @param countInUse reads how much capacity is currently in use
     */
    constructor(limit: number, countInUse: () => number) {
        this.limit = limit;
        this.countInUse = countInUse;
    }

    /**
     * Runs the provided function only if the capacity limit has not been reached yet.
     */
    async attempt<T>(fn: () => Promise<T>): Promise<TrySyncOutcome<T>> {
        if (this.countInUse() >= this.limit) return new TrySyncOutcome({ blocked: 'capacity-reached' });
        const result = await fn();
        return new TrySyncOutcome({ executed: result });
    }
}
