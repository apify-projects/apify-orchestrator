import type { ActorRun } from 'apify-client';

import { RUN_WATCH_INTERVAL_MS, RUN_WATCH_SEGMENT_SECS } from './constants.js';
import type { OrchestratorContext } from './context/orchestrator-context.js';
import type { RunInfo } from './types.js';
import { Interval } from './utils/concurrency/interval.js';
import { stringifyError } from './utils/errors.js';
import { onActorShuttingDown } from './utils/run-lifecycle.js';

export interface RunWatcherOptions {
    /**
     * Reads the Runs which are believed to be active, and are therefore worth watching.
     */
    getActiveRuns: () => { [runName: string]: RunInfo };

    /**
     * Waits for a Run to finish, for at most the given amount of seconds.
     * It is expected to update the Run tracker as a side effect, and to throw if the Run cannot be fetched.
     */
    waitForRunToFinish: (runName: string, runId: string, waitSecs: number) => Promise<ActorRun | undefined>;

    /**
     * Called when a Run could not be waited for: it is expected to stop counting the Run as active.
     */
    onRunLost: (runName: string) => void;
}

/**
 * Keeps a watch on every Run which is believed to be active, to notice when it terminates.
 *
 * Runs are normally tracked as a side effect of the operations performed on them, which is enough when the
 * user waits for them, but not when they are just enqueued: without watching, a terminated Run could be
 * considered active forever, and it would take up capacity which is never released.
 *
 * For this reason, the watcher is only needed when a concurrency limit is in place.
 *
 * Watching relies on the API keeping a request open until the Run finishes, rather than on asking repeatedly:
 * a Run costs about one request per minute, and its termination is noticed as soon as it happens.
 * Once a request returns, the Run is watched again by the next scan, unless it is not active anymore.
 *
 * The watcher runs for the lifetime of the orchestrator and is stopped when the Actor is shutting down.
 */
export class RunWatcher {
    private readonly watchedRunNames = new Set<string>();

    private readonly interval: Interval;

    private readonly context: OrchestratorContext;
    private readonly options: RunWatcherOptions;

    constructor(context: OrchestratorContext, options: RunWatcherOptions) {
        this.context = context;
        this.options = options;

        this.interval = new Interval(this.watchActiveRuns.bind(this), RUN_WATCH_INTERVAL_MS);

        onActorShuttingDown(() => this.interval.stop());
    }

    /**
     * Starts watching every active Run which is not being watched already.
     */
    private async watchActiveRuns(): Promise<void> {
        for (const [runName, runInfo] of Object.entries(this.options.getActiveRuns())) {
            if (this.watchedRunNames.has(runName)) continue;
            this.watchedRunNames.add(runName);
            // Watching a Run takes as long as the Run itself, so it is deliberately not awaited here.
            void this.watchRun(runName, runInfo.runId);
        }
    }

    private async watchRun(runName: string, runId: string): Promise<void> {
        try {
            // A single request can only wait for a limited amount of time. Waiting again, if the Run is still
            // running, is left to the next scan: this way the scan interval also bounds how often we can ask,
            // even if the API were to return immediately.
            await this.options.waitForRunToFinish(runName, runId, RUN_WATCH_SEGMENT_SECS);
        } catch (error) {
            // Waiting mainly fails for a Run which does not exist anymore, so the Run is given up on: keeping
            // it would take up capacity forever, as nothing else would ever notice that it is over.
            this.context.logger
                .prefixed(runName)
                .warning('Could not watch Run: giving up on it.', { error: stringifyError(error) });
            this.options.onRunLost(runName);
        } finally {
            // A Run which terminated, or was given up on, is no longer active: it is not watched again.
            this.watchedRunNames.delete(runName);
        }
    }
}
