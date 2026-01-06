/**
 * A JavaScript interval that can be stopped externally.
 */
export class Interval {
    private readonly intervalId: NodeJS.Timeout;

    private stopped = false;

    constructor(
        op: () => Promise<void>,
        private readonly intervalMs: number,
    ) {
        this.intervalId = setInterval(op, this.intervalMs);
    }

    stop() {
        this.stopped = true;
        clearInterval(this.intervalId);
    }

    isStopped() {
        return this.stopped;
    }
}
