import type { ActorRun } from 'apify-client';

import type { OrchestratorContext } from './context/orchestrator-context.js';
import type { RunInfo } from './types.js';
import { isRunFailStatus } from './utils/apify-client.js';
import { getRunUrl } from './utils/apify-console.js';

type RunInfoRecord = { [runName: string]: RunInfo };

export interface TrackedRuns {
    current: RunInfoRecord;
    failedHistory: { [runName: string]: RunInfo[] };
}

export class RunTracker {
    private readonly context: OrchestratorContext;
    private readonly trackedRuns: TrackedRuns;

    constructor(context: OrchestratorContext, trackedRuns: TrackedRuns) {
        this.context = context;
        this.trackedRuns = trackedRuns;
        this.itemsChangedCallback();
    }

    getCurrentRuns(): { [runName: string]: RunInfo } {
        return cloneRunInfoRecord(this.trackedRuns.current);
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

    updateRun(runName: string, run?: ActorRun): void {
        if (!run) {
            this.trackLostRun(runName);
            return;
        }

        const runInfo = buildRunInfo(run);

        const hasChanged = hasRunChanged(this.trackedRuns.current[runName], runInfo);

        this.trackedRuns.current[runName] = runInfo;

        if (hasChanged) {
            const { startedAt, status } = runInfo;
            this.context.logger
                .prefixed(runName)
                .info('Run status update', { startedAt, status }, { url: runInfo.runUrl });
            this.itemsChangedCallback(runName, run);
        }

        if (isRunFailStatus(runInfo.status)) {
            this.addOrUpdateFailedRun(runName, runInfo);
        }
    }

    private trackLostRun(runName: string): void {
        const runInfo = this.findAndDeleteRun(runName);
        if (!runInfo) return;
        this.context.logger.prefixed(runName).info('Lost Run', undefined, { url: runInfo.runUrl });
        this.addOrUpdateFailedRun(runName, { ...runInfo, status: 'LOST' });
    }

    private findAndDeleteRun(runName: string): RunInfo | undefined {
        const runInfo = this.trackedRuns.current[runName];
        if (!runInfo) return undefined;
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
        if (this.context.options.onUpdate) {
            this.context.options.onUpdate(
                // Pass a copy to avoid allowing direct changes to the tracker's data
                cloneRunInfoRecord(this.trackedRuns.current),
                lastChangedRunName,
                lastChangedRun,
            );
        }
    }
}

function buildRunInfo(run: ActorRun): RunInfo {
    const { id: runId, status, startedAt } = run;
    const runUrl = getRunUrl(runId);
    const formattedStartedAt = startedAt.toISOString();
    return { runId, runUrl, status, startedAt: formattedStartedAt };
}

function hasRunChanged(existingRun: RunInfo | undefined, newRun: RunInfo): boolean {
    return existingRun?.runId !== newRun.runId || existingRun.status !== newRun.status;
}

function cloneRunInfoRecord(record: RunInfoRecord): RunInfoRecord {
    return Object.fromEntries(Object.entries(record).map(([runName, runInfo]) => [runName, { ...runInfo }]));
}
