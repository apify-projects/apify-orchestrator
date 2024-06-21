import { ActorRun } from 'apify-client';

import { CustomLogger, disabledLogger } from './utils/logging.js';
import { PersistSupport, State } from './utils/persist.js';

const RUNS_KEY = 'RUNS';
const FAILED_RUNS_KEY = 'FAILED_RUNS';

const getRunUrl = (runId: string) => `https://console.apify.com/actors/runs/${runId}`;

const OK_STATUSES = ['READY', 'RUNNING', 'SUCCEEDED'] as const;
const FAIL_STATUSES = ['FAILED', 'ABORTING', 'ABORTED', 'TIMING-OUT', 'TIMED-OUT'] as const;
const STATUSES = [...OK_STATUSES, ...FAIL_STATUSES] as const;

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
    protected customLogger = disabledLogger;
    protected currentRunsState = new State<Record<string, RunInfo>>({});
    protected failedRunsState = new State<Record<string, RunInfo[]>>({});

    async init(customLogger: CustomLogger, persistSupport: PersistSupport = 'none', persistPrefix = 'ORCHESTRATOR-') {
        this.customLogger = customLogger;
        await this.currentRunsState.sync(`${persistPrefix}${RUNS_KEY}`, persistSupport);
        await this.failedRunsState.sync(`${persistPrefix}${FAILED_RUNS_KEY}`, persistSupport);
    }

    get currentRuns() {
        return this.currentRunsState.value;
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
            this.customLogger.prfxInfo(runName, 'Update Run', { status, url: runUrl });
        }

        await this.currentRunsState.update((prev) => ({ ...prev, [runName]: runInfo }));

        // Add or update failed Run information
        if (isRunFailStatus(status)) {
            const failedRunInfos: RunInfo[] = this.failedRunsState.value[runName] ?? [];
            const existingFailedRunInfo = failedRunInfos.find((existingRun) => existingRun.runId === runId);
            if (existingFailedRunInfo) {
                existingFailedRunInfo.status = status;
            } else {
                failedRunInfos.push(runInfo);
            }
            await this.failedRunsState.update((prev) => ({ ...prev, [runName]: failedRunInfos }));
        }

        return runInfo;
    }
}
