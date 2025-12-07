import type { RunInfo } from '../types.js';
import type { GlobalContext } from '../utils/context.js';

export type FailedRunsHistory = { [runName: string]: RunInfo[] };

export class FailedRunHistoryTracker {
    constructor(
        protected readonly context: GlobalContext,
        protected readonly failedRunsHistory: FailedRunsHistory,
    ) {}

    addOrUpdateFailedRun(runName: string, runInfo: RunInfo) {
        const { runId, status } = runInfo;
        const failedRunInfos: RunInfo[] = this.failedRunsHistory[runName] ?? [];
        const existingFailedRunInfo = failedRunInfos.find((existingRun) => existingRun.runId === runId);
        if (existingFailedRunInfo) {
            existingFailedRunInfo.status = status;
        } else {
            failedRunInfos.push(runInfo);
        }
        this.failedRunsHistory[runName] = failedRunInfos;
    }
}
