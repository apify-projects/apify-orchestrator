import type { ActorRun } from 'apify-client';

import type { PersistenceSupport, RunInfo, UpdateCallback } from './types.js';
import type { GlobalContext } from './utils/context.js';
import { State } from './utils/persist.js';

const RUNS_KEY = 'RUNS';
const FAILED_RUNS_KEY = 'FAILED_RUNS';

const getRunUrl = (runId: string) => `https://console.apify.com/actors/runs/${runId}`;

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

export interface RunTrackerOptions {
    persistenceSupport: PersistenceSupport;
    persistencePrefix: string;
    persistenceEncryptionKey?: string;
    enableFailedHistory: boolean;
}

export class RunTracker {
    protected constructor(
        protected readonly context: GlobalContext,
        protected readonly options: RunTrackerOptions,
        protected readonly currentRunsState: State<Record<string, RunInfo>>,
        protected readonly failedRunsHistoryState: State<Record<string, RunInfo[]>>,
        protected readonly onUpdate?: UpdateCallback,
    ) {}

    static async new(context: GlobalContext, options: RunTrackerOptions, onUpdate?: UpdateCallback) {
        const currentRunsState = new State<Record<string, RunInfo>>({});
        const failedRunsHistoryState = new State<Record<string, RunInfo[]>>({});

        let wasSyncSuccessful = await currentRunsState.sync(
            `${options.persistencePrefix}${RUNS_KEY}`,
            options.persistenceSupport,
            options.persistenceEncryptionKey, // We need to encrypt this data because it includes Run IDs and URLs
        );

        if (options.enableFailedHistory) {
            wasSyncSuccessful =
                wasSyncSuccessful &&
                (await failedRunsHistoryState.sync(
                    `${options.persistencePrefix}${FAILED_RUNS_KEY}`,
                    options.persistenceSupport,
                    options.persistenceEncryptionKey, // We need to encrypt this data because it includes Run IDs and URLs
                ));
        }
        if (!wasSyncSuccessful) {
            context.logger.error('Some error happened while syncing the Orchestrator with the chosen support', {
                options,
            });
        }

        const runTracker = new RunTracker(context, options, currentRunsState, failedRunsHistoryState, onUpdate);
        await runTracker.itemsChangedCallback();

        return runTracker;
    }

    protected async itemsChangedCallback(lastChangedRunName?: string, lastChangedRun?: ActorRun) {
        if (this.onUpdate) {
            this.onUpdate(
                // Pass a copy to avoid allowing direct changes to the tracker's data
                Object.fromEntries(
                    Object.entries(this.currentRuns).map(([runName, runInfo]) => [runName, { ...runInfo }]),
                ),
                lastChangedRunName,
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

    get currentRuns() {
        return this.currentRunsState.value;
    }

    findRunByName(runName: string): RunInfo | undefined {
        const runInfo = this.currentRunsState.value[runName];
        if (!runInfo) {
            return undefined;
        }
        this.context.logger.prefixed(runName).info('Found existing tracked Run', {}, { url: runInfo.runUrl });
        return runInfo;
    }

    findRunName(runId: string): string | undefined {
        for (const [runName, runInfo] of Object.entries(this.currentRuns)) {
            if (runInfo.runId === runId) {
                return runName;
            }
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

        if (isRunFailStatus(status) && this.options.enableFailedHistory) {
            await this.addOrUpdateFailedRun(runName, runInfo);
        }

        if (itemChanged) {
            this.context.logger.prefixed(runName).info('Update Run', { status }, { url: runUrl });
            await this.itemsChangedCallback(runName, run);
        }

        return runInfo;
    }

    async declareLostRun(runName: string, reason?: string) {
        const runInfo = this.currentRuns[runName];
        if (!runInfo) {
            return;
        }
        runInfo.status = 'LOST';
        this.context.logger.prefixed(runName).info('Lost Run', { reason }, { url: runInfo.runUrl });
        if (this.options.enableFailedHistory) {
            await this.addOrUpdateFailedRun(runName, runInfo);
        }
        await this.currentRunsState.update((prev) => {
            const { [runName]: _, ...rest } = prev;
            return rest;
        });
    }
}
