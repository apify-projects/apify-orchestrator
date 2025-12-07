import type { ActorRun } from 'apify-client';

import type { RunInfo } from '../types.js';
import type { GlobalContext } from '../utils/context.js';
import type { CurrentRuns, CurrentRunTracker } from './current-run-tracker.js';
import type { FailedRunHistoryTracker } from './failed-run-history-tracker.js';

const OK_STATUSES = ['READY', 'RUNNING', 'SUCCEEDED'] as const;
const FAIL_STATUSES = ['FAILED', 'ABORTING', 'ABORTED', 'TIMING-OUT', 'TIMED-OUT'] as const;

type RunOkStatus = (typeof OK_STATUSES)[number];
type RunFailStatus = (typeof FAIL_STATUSES)[number];

export function isRunOkStatus(status: string): status is RunOkStatus {
    return OK_STATUSES.includes(status as RunOkStatus);
}

export function isRunFailStatus(status: string): status is RunFailStatus {
    return FAIL_STATUSES.includes(status as RunFailStatus);
}

export class RunTracker {
    constructor(
        protected readonly context: GlobalContext,
        protected readonly currentRunTracker: CurrentRunTracker,
        protected readonly failedRunHistoryTracker?: FailedRunHistoryTracker,
    ) {}

    get currentRuns(): CurrentRuns {
        return this.currentRunTracker.currentRuns;
    }

    findRunByName(runName: string): RunInfo | undefined {
        return this.currentRunTracker.findRunByName(runName);
    }

    findRunName(runId: string): string | undefined {
        return this.currentRunTracker.findRunName(runId);
    }

    updateRun(runName: string, run: ActorRun): RunInfo {
        const runInfo = this.currentRunTracker.addOrUpdateRun(runName, run);

        if (isRunFailStatus(runInfo.status)) {
            this.failedRunHistoryTracker?.addOrUpdateFailedRun(runName, runInfo);
        }

        return runInfo;
    }

    declareLostRun(runName: string, reason?: string) {
        const runInfo = this.currentRunTracker.findAndDeleteRun(runName);
        if (!runInfo) {
            return;
        }
        this.context.logger.prefixed(runName).info('Lost Run', { reason }, { url: runInfo.runUrl });
        this.failedRunHistoryTracker?.addOrUpdateFailedRun(runName, { ...runInfo, status: 'LOST' });
    }
}
