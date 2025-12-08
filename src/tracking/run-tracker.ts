import type { ActorRun } from 'apify-client';

import type { RunInfo } from '../types.js';
import { isRunFailStatus } from '../utils/apify-client.js';
import type { GlobalContext } from '../utils/context.js';
import type { CurrentRunTracker } from './current-run-tracker.js';
import type { FailedRunHistoryTracker } from './failed-run-history-tracker.js';

export class RunTracker {
    constructor(
        protected readonly context: GlobalContext,
        protected readonly currentRunTracker: CurrentRunTracker,
        protected readonly failedRunHistoryTracker?: FailedRunHistoryTracker,
    ) {}

    getCurrentRunNames(): string[] {
        return this.currentRunTracker.getCurrentRunNames();
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
