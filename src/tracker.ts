import { ActorRun } from 'apify-client';

import { PersistSupport, RunInfo, UpdateCallback } from './types.js';
import { CustomLogger } from './utils/logging.js';
import { State } from './utils/persist.js';

const RUNS_KEY = 'RUNS';
const FAILED_RUNS_KEY = 'FAILED_RUNS';

const getRunUrl = (runId: string) => `https://console.apify.com/actors/runs/${runId}`;

const OK_STATUSES = ['READY', 'RUNNING', 'SUCCEEDED'] as const;
const FAIL_STATUSES = ['FAILED', 'ABORTING', 'ABORTED', 'TIMING-OUT', 'TIMED-OUT'] as const;

type RunOkStatus = typeof OK_STATUSES[number]
type RunFailStatus = typeof FAIL_STATUSES[number]

export function isRunOkStatus(status: string): status is RunOkStatus {
    return OK_STATUSES.includes(status as RunOkStatus);
}

export function isRunFailStatus(status: string): status is RunFailStatus {
    return FAIL_STATUSES.includes(status as RunFailStatus);
}

export class RunsTracker {
    protected customLogger: CustomLogger;
    protected enableFailedHistory: boolean;
    protected currentRunsState: State<Record<string, RunInfo>>;
    protected failedRunsHistoryState: State<Record<string, RunInfo[]>>;
    protected onUpdate: UpdateCallback | undefined;

    constructor(
        customLogger: CustomLogger,
        enableFailedHistory: boolean,
        onUpdate?: UpdateCallback,
    ) {
        this.customLogger = customLogger;
        this.enableFailedHistory = enableFailedHistory;
        this.currentRunsState = new State<Record<string, RunInfo>>({});
        this.failedRunsHistoryState = new State<Record<string, RunInfo[]>>({});
        this.onUpdate = onUpdate;
    }

    protected async itemsChangedCallback(lastChangedRun?: ActorRun) {
        if (this.onUpdate) {
            this.onUpdate(
                // Pass a copy to avoid allowing direct changes to the tracker's data
                Object.fromEntries(
                    Object.entries(this.currentRuns).map(([runName, runInfo]) => [runName, { ...runInfo }]),
                ),
                lastChangedRun,
            );
        }
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
    async init(persistSupport: PersistSupport = 'none', persistPrefix = 'ORCHESTRATOR-', persistEncryptionKey?: string) {
        let wasSyncSuccessful = await this.currentRunsState.sync(
            `${persistPrefix}${RUNS_KEY}`,
            persistSupport,
            persistEncryptionKey, // We need to encrypt this data because it includes Run IDs and URLs
        );
        if (this.enableFailedHistory) {
            wasSyncSuccessful = wasSyncSuccessful && await this.failedRunsHistoryState.sync(
                `${persistPrefix}${FAILED_RUNS_KEY}`,
                persistSupport,
                persistEncryptionKey, // We need to encrypt this data because it includes Run IDs and URLs
            );
        }
        if (!wasSyncSuccessful) {
            this.customLogger.error(
                'Some error happened while syncing the Orchestrator with the chosen support',
                { persistSupport },
            );
        }
        await this.itemsChangedCallback();
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
        const { id: runId, status, startedAt } = run;
        const runUrl = getRunUrl(runId);
        const formattedStartedAt = startedAt.toISOString();
        const runInfo: RunInfo = { runId, runUrl, status, startedAt: formattedStartedAt };

        const itemChanged = this.currentRuns[runName]?.runId !== runId || this.currentRuns[runName]?.status !== status;

        await this.currentRunsState.update((prev) => ({ ...prev, [runName]: runInfo }));

        if (isRunFailStatus(status) && this.enableFailedHistory) {
            await this.addOrUpdateFailedRun(runName, runInfo);
        }

        if (itemChanged) {
            this.customLogger.prfxInfo(runName, 'Update Run', { status }, { url: runUrl });
            await this.itemsChangedCallback(run);
        }

        return runInfo;
    }

    async declareLostRun(runName: string, reason?: string) {
        const runInfo = this.currentRuns[runName];
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
