import { RUN_STATUS_POLL_INTERVAL_MS } from './constants.js';
import type { OrchestratorContext } from './context/orchestrator-context.js';
import type { RunInfo } from './types.js';
import { Interval } from './utils/concurrency/interval.js';
import { TryLock } from './utils/concurrency/try-lock.js';
import { stringifyError } from './utils/errors.js';
import { onActorShuttingDown } from './utils/run-lifecycle.js';

export interface RunStatusPollerOptions {
    /**
     * Reads the Runs which are believed to be active, and whose status is therefore worth refreshing.
     */
    getActiveRuns: () => { [runName: string]: RunInfo };

    /**
     * Fetches the current state of a Run, which is expected to update the Run tracker as a side effect.
     */
    refreshRun: (runName: string, runId: string) => Promise<void>;
}

/**
 * Periodically refreshes the status of the Runs which are believed to be active.
 *
 * Runs are normally tracked as a side effect of the operations performed on them, which is enough when the
 * user waits for them, but not when they are just enqueued: without polling, a terminated Run could be
 * considered active forever, and it would take up capacity which is never released.
 *
 * For this reason, the poller is only needed when a concurrency limit is in place.
 *
 * The poller runs for the lifetime of the orchestrator and is stopped when the Actor is shutting down.
 */
export class RunStatusPoller {
    private readonly exclusiveLock = new TryLock(); // ensures only one refresh is in progress at a time

    private readonly interval: Interval;

    private readonly context: OrchestratorContext;
    private readonly options: RunStatusPollerOptions;

    constructor(context: OrchestratorContext, options: RunStatusPollerOptions) {
        this.context = context;
        this.options = options;

        this.interval = new Interval(this.attemptRefreshingActiveRuns.bind(this), RUN_STATUS_POLL_INTERVAL_MS);

        onActorShuttingDown(() => this.interval.stop());
    }

    /**
     * Try refreshing all the active Runs at once, unless a previous attempt is still in progress.
     */
    private async attemptRefreshingActiveRuns(): Promise<void> {
        await this.exclusiveLock.attempt(async () => {
            const activeRuns = Object.entries(this.options.getActiveRuns());
            await Promise.all(
                activeRuns.map(async ([runName, runInfo]) =>
                    this.options.refreshRun(runName, runInfo.runId).catch((error) => {
                        // A Run which cannot be refreshed keeps its last known status and is retried later.
                        this.context.logger
                            .prefixed(runName)
                            .warning('Could not refresh Run status.', { error: stringifyError(error) });
                    }),
                ),
            );
        });
    }
}
