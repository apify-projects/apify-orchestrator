/**
 * A JavaScript interval that can be stopped externally.
 */
export class Interval {
    private readonly intervalId: NodeJS.Timeout;
    private readonly intervalMs: number;

    private stopped = false;

    constructor(op: () => Promise<void>, intervalMs: number) {
        this.intervalMs = intervalMs;
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
