import type { ActorRun } from 'apify-client';
import { getRunUrl } from 'src/utils/apify-console.js';

import type { RunInfo, UpdateCallback } from '../types.js';
import type { GlobalContext } from '../utils/context.js';

export type CurrentRuns = { [runName: string]: RunInfo };

export class CurrentRunTracker {
    constructor(
        protected readonly context: GlobalContext,
        protected readonly currentRuns: CurrentRuns,
        protected readonly onUpdate?: UpdateCallback,
    ) {
        this.itemsChangedCallback();
    }

    getCurrentRunNames(): string[] {
        return Object.keys(this.currentRuns);
    }

    findRunByName(runName: string): RunInfo | undefined {
        const runInfo = this.currentRuns[runName];
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

    addOrUpdateRun(runName: string, run: ActorRun): RunInfo {
        const runInfo = buildRunInfo(run);
        const hasChanged = hasRunChanged(this.currentRuns[runName], runInfo);
        this.currentRuns[runName] = runInfo;
        if (hasChanged) {
            this.itemsChangedCallback(runName, run);
        }
        return runInfo;
    }

    findAndDeleteRun(runName: string): RunInfo | undefined {
        const runInfo = this.currentRuns[runName];
        if (!runInfo) {
            return undefined;
        }
        delete this.currentRuns[runName];
        return runInfo;
    }

    protected itemsChangedCallback(lastChangedRunName?: string, lastChangedRun?: ActorRun) {
        if (this.onUpdate) {
            this.onUpdate(
                // Pass a copy to avoid allowing direct changes to the tracker's data
                cloneCurrentRuns(this.currentRuns),
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
    return !existingRun || existingRun.runId !== newRun.runId || existingRun.status !== newRun.status;
}

function cloneCurrentRuns(currentRuns: CurrentRuns): CurrentRuns {
    return Object.fromEntries(Object.entries(currentRuns).map(([runName, runInfo]) => [runName, { ...runInfo }]));
}
