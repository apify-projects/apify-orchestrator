import { type TrySync, TrySyncOutcome } from './try-sync.js';

/**
 * A simple cooldown utility to manage cooldown periods between operations and ensure
 * that operations are not executed during the cooldown period.
 */
export class TryCooldown implements TrySync {
    private cooldownStartTimestamp: number | undefined = undefined;
    private readonly cooldownMs: number;

    constructor(cooldownMs: number) {
        this.cooldownMs = cooldownMs;
    }

    /**
     * Runs the provided function only if not in cooldown period.
     */
    async attempt<T>(fn: () => Promise<T>): Promise<TrySyncOutcome<T>> {
        if (this.isCoolingDown()) return new TrySyncOutcome({ blocked: 'cooldown-period' });
        const result = await fn();
        return new TrySyncOutcome({ executed: result });
    }

    activate() {
        this.cooldownStartTimestamp = Date.now();
    }

    private isCoolingDown() {
        if (this.cooldownStartTimestamp === undefined) return false;

        const elapsedMs = Date.now() - this.cooldownStartTimestamp;
        if (elapsedMs >= this.cooldownMs) {
            this.cooldownStartTimestamp = undefined;
            return false;
        }

        return true;
    }
}
