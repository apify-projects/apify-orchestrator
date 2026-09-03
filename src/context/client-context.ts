import type { ActorRun, RunClient } from 'apify-client';

import { ExtRunClient } from '../clients/run-client.js';
import { RunScheduler } from '../run-scheduler.js';
import type { TrackedRuns } from '../run-tracker.js';
import { RunTracker } from '../run-tracker.js';
import type { OrchestratorOptions, RunInfo } from '../types.js';
import { mergeDictionaries } from '../utils/dictionaries.js';
import { Outcome } from '../utils/outcome.js';
import type { OrchestratorContext } from './orchestrator-context.js';

/**
 * Represents the outcome of searching internally for an existing Run by name.
 * We may be waiting for the Run to start, or we may have tracked information about the Run.
 */
export class RunSearchOutcome extends Outcome<{ promise: () => Promise<ActorRun>; runInfo: RunInfo; notFound: true }> {}

/**
 * The subset of the orchestrator's options which a single client is allowed to override.
 */
export type ClientOptionsOverrides = Pick<OrchestratorOptions, 'maxConcurrency'>;

/**
 * Represents the context available to an Apify Client and other derived clients.
 */
export interface ClientContext extends OrchestratorContext {
    readonly runTracker: RunTracker;
    readonly runScheduler: RunScheduler;

    searchExistingRun(runName: string): RunSearchOutcome;
    extendRunClient(runName: string, runClient: RunClient): ExtRunClient;
}

export function generateClientContext(
    orchestratorContext: OrchestratorContext,
    trackedRuns: TrackedRuns,
    overrideOptions?: ClientOptionsOverrides,
): ClientContext {
    // The client may override some of the orchestrator's options, e.g., to use its own concurrency limit.
    const options = { ...orchestratorContext.options, ...overrideOptions };
    const context: OrchestratorContext = { ...orchestratorContext, options };

    const runTracker = new RunTracker(context, trackedRuns);

    const runScheduler = new RunScheduler(context, {
        runRequestAdapter: (request) => ({
            ...request,
            input: mergeDictionaries(options.fixedInput, request.input),
        }),
        onRunStarted: (runName, run) => runTracker.updateRun(runName, run),
        countActiveRuns: () => runTracker.countActiveRuns(),
    });

    return {
        ...context,
        runTracker,
        runScheduler,

        searchExistingRun(runName: string): RunSearchOutcome {
            // First, check if the Run is currently waiting to start.
            const runPromise = this.runScheduler.findRunStartRequest(runName);
            if (runPromise) return new RunSearchOutcome({ promise: runPromise });

            // Then, check if there is any info about the Run in the tracker.
            const runInfo = this.runTracker.findRunByName(runName);
            if (runInfo) return new RunSearchOutcome({ runInfo });

            // Otherwise, a run with this name does not exist.
            return new RunSearchOutcome({ notFound: true });
        },

        extendRunClient(runName: string, runClient: RunClient): ExtRunClient {
            return new ExtRunClient(
                this,
                // Track every Run update.
                { runName, onUpdate: (run) => this.runTracker.updateRun(runName, run) },
                runClient,
            );
        },
    };
}
