import { log } from 'apify';

import { PersistSupport, state } from './utils/persist';

const RUNS_KEY = 'RUNS';
const ABORTED_RUNS_KEY = 'ABORTED_RUNS';

const getRunUrl = (runId: string) => `https://console.apify.com/actors/runs/${runId}`;

type RunStatus = 'READY' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'ABORTING' | 'ABORTED' | 'TIMING-OUT' | 'TIMED-OUT'

interface RunInfo {
    runId: string
    runUrl: string
    status: RunStatus
}

interface ExtRunInfo extends RunInfo {
    apifyToken?: string
}

export interface RunsTracker {
    /**
     * The persisted Runs info with the token used for each Run.
     */
    runs: Record<string, ExtRunInfo>

    /**
     * Returns the names of the Runs with one the required statuses.
     */
    runNamesByStatus: (...statuses: RunStatus[]) => string[]

    /**
     * Persists the Run info and saves the used Apify token.
     */
    register: (runName: string, runId: string, status: RunStatus, apifyToken?: string) => Promise<ExtRunInfo>

    /**
     * Saves just the Apify token. Useful after a resurrection.
     */
    refreshToken: (runName: string, apifyToken?: string) => void

    /**
     * Updates the persisted status of a Run.
     */
    updateStatus: (runName: string, status: RunStatus) => Promise<void>
}

export async function getRunsTracker(
    persistSupport: PersistSupport,
    persistPrefix = 'ORCHESTRATOR-',
): Promise<RunsTracker> {
    const runs = await state<Record<string, RunInfo>>(`${persistPrefix}${RUNS_KEY}`, {}, persistSupport);
    const abortedRuns = await state<Record<string, RunInfo[]>>(`${persistPrefix}${ABORTED_RUNS_KEY}`, {}, persistSupport);

    // Store the Apify tokens to perform operations on Runs in progress with the right privileges.
    // This information is never stored on the KeyValueStore.
    const runsTokens: Record<string, string | undefined> = {};

    return {
        get runs() {
            const result: Record<string, ExtRunInfo> = {};
            for (const [runName, runInfo] of Object.entries(runs.value)) {
                result[runName] = { ...runInfo, apifyToken: runsTokens[runName] };
            }
            return result;
        },

        runNamesByStatus: (...statuses: RunStatus[]) => {
            const results: string[] = [];
            for (const [runName, runInfo] of Object.entries(runs.value)) {
                if (statuses.includes(runInfo.status)) {
                    results.push(runName);
                }
            }
            return results;
        },

        register: async (runName: string, runId: string, status: RunStatus, apifyToken?: string) => {
            const runInfo = { runId, runUrl: getRunUrl(runId), status };
            await runs.update((record) => ({ ...record, [runName]: runInfo }));
            runsTokens[runName] = apifyToken;
            return runInfo;
        },

        refreshToken: (runName:string, apifyToken?: string) => {
            runsTokens[runName] = apifyToken;
        },

        updateStatus: async (runName: string, status: RunStatus) => {
            if (!(runName in runs.value)) {
                log.warning('Tried to update a run which does not exist', { runName });
                return;
            }
            await runs.update((record) => ({
                ...record,
                [runName]: {
                    ...record[runName],
                    status,
                },
            }));
            if (status === 'ABORTED') {
                await abortedRuns.update((record) => {
                    if (!(runName in record)) {
                        record[runName] = [];
                    }
                    record[runName].push(runs.value[runName]);
                    return record;
                });
            }
        },
    };
}
