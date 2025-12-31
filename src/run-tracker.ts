import type { ActorRun } from 'apify-client';

import type { RunInfo, UpdateCallback } from './types.js';
import { isRunFailStatus } from './utils/apify-client.js';
import { getRunUrl } from './utils/apify-console.js';
import type { GlobalContext } from './utils/context.js';
import type { Storage } from './utils/storage.js';

const TRACKED_RUNS_KEY = 'RUNS';

type RunInfoRecord = { [runName: string]: RunInfo };

export interface TrackedRuns {
    current: RunInfoRecord;
    failedHistory: { [runName: string]: RunInfo[] };
}

export interface RunTrackerOptions {
    storage?: Storage;
    storagePrefix?: string;
    onUpdate?: UpdateCallback;
}

export class RunTracker {
    private constructor(
        private readonly context: GlobalContext,
        private readonly trackedRuns: TrackedRuns,
        private readonly onUpdate?: UpdateCallback,
    ) {
        this.itemsChangedCallback();
    }

    static async new(context: GlobalContext, options?: RunTrackerOptions): Promise<RunTracker> {
        const defaultTrackedRuns = getDefaultTrackedRuns();
        const storageKey = `${options?.storagePrefix ?? ''}${TRACKED_RUNS_KEY}`;
        const trackedRuns =
            (await options?.storage?.useState<TrackedRuns>(storageKey, defaultTrackedRuns)) ?? defaultTrackedRuns;
        return new RunTracker(context, trackedRuns, options?.onUpdate);
    }

    getCurrentRunNames(): string[] {
        return Object.keys(this.trackedRuns.current);
    }

    findRunByName(runName: string): RunInfo | undefined {
        const runInfo = this.trackedRuns.current[runName];
        if (!runInfo) {
            return undefined;
        }
        this.context.logger.prefixed(runName).info('Found existing tracked Run', {}, { url: runInfo.runUrl });
        return runInfo;
    }

    findRunName(runId: string): string | undefined {
        for (const [runName, runInfo] of Object.entries(this.trackedRuns.current)) {
            if (runInfo.runId === runId) {
                return runName;
            }
        }
        return undefined;
    }

    updateRun(runName: string, run: ActorRun): RunInfo {
        const runInfo = buildRunInfo(run);

        const hasChanged = hasRunChanged(this.trackedRuns.current[runName], runInfo);

        this.trackedRuns.current[runName] = runInfo;

        if (hasChanged) {
            this.itemsChangedCallback(runName, run);
        }

        if (isRunFailStatus(runInfo.status)) {
            this.addOrUpdateFailedRun(runName, runInfo);
        }

        return runInfo;
    }

    declareLostRun(runName: string, reason?: string) {
        const runInfo = this.findAndDeleteRun(runName);
        if (!runInfo) {
            return;
        }
        this.context.logger.prefixed(runName).info('Lost Run', { reason }, { url: runInfo.runUrl });
        this.addOrUpdateFailedRun(runName, { ...runInfo, status: 'LOST' });
    }

    private findAndDeleteRun(runName: string): RunInfo | undefined {
        const runInfo = this.trackedRuns.current[runName];
        if (!runInfo) {
            return undefined;
        }
        delete this.trackedRuns.current[runName];
        return runInfo;
    }

    private addOrUpdateFailedRun(runName: string, runInfo: RunInfo) {
        const { runId, status } = runInfo;
        const failedRunInfos: RunInfo[] = this.trackedRuns.failedHistory[runName] ?? [];
        const existingFailedRunInfo = failedRunInfos.find((existingRun) => existingRun.runId === runId);
        if (existingFailedRunInfo) {
            existingFailedRunInfo.status = status;
        } else {
            failedRunInfos.push(runInfo);
        }
        this.trackedRuns.failedHistory[runName] = failedRunInfos;
    }

    private itemsChangedCallback(lastChangedRunName?: string, lastChangedRun?: ActorRun) {
        if (this.onUpdate) {
            this.onUpdate(
                // Pass a copy to avoid allowing direct changes to the tracker's data
                cloneRunInfoRecord(this.trackedRuns.current),
                lastChangedRunName,
                lastChangedRun,
            );
        }
    }
}

function getDefaultTrackedRuns(): TrackedRuns {
    return {
        current: {},
        failedHistory: {},
    };
}

function buildRunInfo(run: ActorRun): RunInfo {
    const { id: runId, status, startedAt } = run;
    const runUrl = getRunUrl(runId);
    const formattedStartedAt = startedAt.toISOString();
    return { runId, runUrl, status, startedAt: formattedStartedAt };
}

function hasRunChanged(existingRun: RunInfo | undefined, newRun: RunInfo): boolean {
    return !existingRun || existingRun.runId !== newRun.runId || existingRun.status !== newRun.status;
}

function cloneRunInfoRecord(record: RunInfoRecord): RunInfoRecord {
    return Object.fromEntries(Object.entries(record).map(([runName, runInfo]) => [runName, { ...runInfo }]));
}
