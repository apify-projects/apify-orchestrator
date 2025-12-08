import type { OrchestratorOptions } from '../types.js';
import type { GlobalContext } from '../utils/context.js';
import type { CurrentRuns } from './current-run-tracker.js';
import { CurrentRunTracker } from './current-run-tracker.js';
import type { FailedRunsHistory } from './failed-run-history-tracker.js';
import { FailedRunHistoryTracker } from './failed-run-history-tracker.js';
import { RunTracker } from './run-tracker.js';

const RUNS_KEY = 'RUNS';
const FAILED_RUNS_KEY = 'FAILED_RUNS';

export async function buildRunTrackerForOrchestrator(
    context: GlobalContext,
    options: OrchestratorOptions,
): Promise<RunTracker> {
    const currentRunTracker = await buildCurrentRunTracker(context, options);
    const failedRunHistoryTracker = await buildFailedRunHistoryTracker(context, options);
    return new RunTracker(context, currentRunTracker, failedRunHistoryTracker);
}

async function buildCurrentRunTracker(
    context: GlobalContext,
    options: OrchestratorOptions,
): Promise<CurrentRunTracker> {
    const currentRuns = (await context.storage?.useState<CurrentRuns>(RUNS_KEY, {})) ?? {};
    return new CurrentRunTracker(context, currentRuns, options.onUpdate);
}

async function buildFailedRunHistoryTracker(
    context: GlobalContext,
    options: OrchestratorOptions,
): Promise<FailedRunHistoryTracker | undefined> {
    // Since failed runs are only stored and never read by the orchestrator itself, we skip initializing the tracker if
    // the user does not want to store information or sensitive information.
    if (options.hideSensitiveInformation || !context.storage) {
        return undefined;
    }
    const failedRunsHistory = await context.storage.useState<FailedRunsHistory>(FAILED_RUNS_KEY, {});
    return new FailedRunHistoryTracker(context, failedRunsHistory);
}
