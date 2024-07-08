import { ActorRun } from 'apify-client';

import { PersistSupport } from './types.js';
import { CustomLogger } from './utils/logging.js';
import { State } from './utils/persist.js';

const RUNS_KEY = 'RUNS';
const FAILED_RUNS_KEY = 'FAILED_RUNS';

const getRunUrl = (runId: string) => `https://console.apify.com/actors/runs/${runId}`;

const OK_STATUSES = ['READY', 'RUNNING', 'SUCCEEDED'] as const;
const FAIL_STATUSES = ['FAILED', 'ABORTING', 'ABORTED', 'TIMING-OUT', 'TIMED-OUT'] as const;

/**
 * Includes all the "OK" and "fail" statuses from the SDK.
 *
 * `LOST` is an extra "fail" status to track when the Actor client is not able to return the Run.
 */
const STATUSES = [...OK_STATUSES, ...FAIL_STATUSES, 'LOST'] as const;

type RunOkStatus = typeof OK_STATUSES[number]
type RunFailStatus = typeof FAIL_STATUSES[number]
type RunStatus = typeof STATUSES[number]

export function isRunOkStatus(status: RunStatus): status is RunOkStatus {
    return OK_STATUSES.includes(status as RunOkStatus);
}

export function isRunFailStatus(status: RunStatus): status is RunFailStatus {
    return FAIL_STATUSES.includes(status as RunFailStatus);
}

interface RunInfo {
    runId: string
    runUrl: string
    status: RunStatus
}

export class RunsTracker {
    protected customLogger: CustomLogger;
    protected enableFailedHistory: boolean;
    protected currentRunsState: State<Record<string, RunInfo>>;
    protected failedRunsHistoryState: State<Record<string, RunInfo[]>>;

    constructor(customLogger: CustomLogger, enableFailedHistory: boolean) {
        this.customLogger = customLogger;
        this.enableFailedHistory = enableFailedHistory;
        this.currentRunsState = new State<Record<string, RunInfo>>({});
        this.failedRunsHistoryState = new State<Record<string, RunInfo[]>>({});
    }

    protected async addOrUpdateFailedRun(runName: string, runInfo: RunInfo) {
        const { runId, status } = runInfo;
        const failedRunInfos: RunInfo[] = this.failedRunsHistoryState.value[runName] ?? [];
        const existingFailedRunInfo = failedRunInfos.find((existingRun) => existingRun.runId === runId);
        if (existingFailedRunInfo) {
            existingFailedRunInfo.status = status;
        } else {
            failedRunInfos.push(runInfo);
        }
        await this.failedRunsHistoryState.update((prev) => ({ ...prev, [runName]: failedRunInfos }));
    }

    /**
     * Sync with the persisted data.
     */
    async init(persistSupport: PersistSupport = 'none', persistPrefix = 'ORCHESTRATOR-') {
        await this.currentRunsState.sync(`${persistPrefix}${RUNS_KEY}`, persistSupport);
        if (this.enableFailedHistory) {
            await this.failedRunsHistoryState.sync(`${persistPrefix}${FAILED_RUNS_KEY}`, persistSupport);
        }
    }

    get currentRuns() {
        return this.currentRunsState.value;
    }

    findRunByName(runName: string): RunInfo | undefined {
        const runInfo = this.currentRunsState.value[runName];
        if (!runInfo) { return undefined; }
        this.customLogger.prfxInfo(runName, 'Found existing tracked Run', {}, { url: runInfo.runUrl });
        return runInfo;
    }

    findRunName(runId: string): string | undefined {
        for (const [runName, runInfo] of Object.entries(this.currentRuns)) {
            if (runInfo.runId === runId) { return runName; }
        }
        return undefined;
    }

    /**
     * Updates the persisted status of a Run.
     */
    async updateRun(runName: string, run: ActorRun): Promise<RunInfo> {
        const { id: runId, status } = run;
        const runUrl = getRunUrl(runId);
        const runInfo: RunInfo = { runId, runUrl, status };

        if (this.currentRuns[runName]?.runId !== runId || this.currentRuns[runName]?.status !== status) {
            this.customLogger.prfxInfo(runName, 'Update Run', { status }, { url: runUrl });
        }

        await this.currentRunsState.update((prev) => ({ ...prev, [runName]: runInfo }));

        if (isRunFailStatus(status) && this.enableFailedHistory) {
            await this.addOrUpdateFailedRun(runName, runInfo);
        }

        return runInfo;
    }

    async declareLostRun(runName: string, reason?: string) {
        const runInfo = this.currentRunsState.value[runName];
        if (!runInfo) { return; }
        runInfo.status = 'LOST';
        this.customLogger.prfxInfo(runName, 'Lost Run', { reason }, { url: runInfo.runUrl });
        if (this.enableFailedHistory) {
            await this.addOrUpdateFailedRun(runName, runInfo);
        }
        await this.currentRunsState.update((prev) => {
            delete prev[runName];
            return prev;
        });
    }
}
