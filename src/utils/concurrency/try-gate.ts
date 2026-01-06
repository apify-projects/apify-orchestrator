import { type TrySync, TrySyncOutcome } from './try-sync.js';

export class TryGate implements TrySync {
    private isOpen = true;

    /**
     * Runs the provided function only if the gate is open.
     */
    async attempt<T>(criticalSection: () => Promise<T>): Promise<TrySyncOutcome<T>> {
        if (!this.isOpen) return TrySyncOutcome.blocked('gate-closed');
        const result = await criticalSection();
        return TrySyncOutcome.executed(result);
    }

    /**
     * Closes the gate, preventing any further executions.
     */
    close() {
        this.isOpen = false;
    }
}
