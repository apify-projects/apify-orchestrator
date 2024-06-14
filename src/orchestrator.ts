import { Actor, ActorRun, log } from 'apify';

import { abortAndTrackRun, getDefaultRunOptions, getRun, startAndTrackRun, waitAndTrackRun } from './client.js';
import { getLogger } from './logging.js';
import { RunRequest, RunRequestsManager, waitForRequest } from './run-request.js';
import { getRunsTracker } from './tracking.js';
import { getAvailableMemoryGBs } from './utils/apify-api.js';
import { DatasetClientListItemOptions, DatasetItem, iteratePaginatedDataset } from './utils/dataset.js';
import { PersistSupport } from './utils/persist.js';

const MAIN_LOOP_INTERVAL_MS = 1000;

export interface OrchestratorOptions {
    /**
     * `true` by default.
     */
    enableLogs: boolean

    /**
     * `undefined` by default. If defined, the current Runs will be logged periodically.
     */
    statsIntervalSec?: number

    /**
     * `kvs` by default: the orchestrator data will be persisted on the KeyValueStore. Choose `none` to disable.
     */
    persistSupport: PersistSupport

    /**
     * `ORCHESTRATOR-` by default. Used to persist data on the KeyValueStore.
     */
    persistPrefix: string

    /**
     * `true` by default. Abort all Runs on graceful abort of the Orchestrator.
     *
     * Notice that, if disabled, a function that is waiting for a Run to finish
     * may not notice when the orchestrator is aborted and will be killed abruptly.
     */
    abortAllRunsOnGracefulAbort: boolean
}

const DEFAULT_OPTIONS: OrchestratorOptions = {
    enableLogs: true,
    persistSupport: 'kvs',
    persistPrefix: 'ORCHESTRATOR-',
    abortAllRunsOnGracefulAbort: true,
};

export type RunRecord = Record<string, ActorRun | null>
export interface ApifyOrchestrator {
    enqueue: (...runRequests: RunRequest[]) => string[]
    start: (...runRequests: RunRequest[]) => Promise<RunRecord>
    waitStart: (...runNames: string[]) => Promise<RunRecord>
    waitFinish: (...runNames: string[]) => Promise<RunRecord>
    startAndWaitFinish: (...runRequests: RunRequest[]) => Promise<RunRecord>
    iteratePaginatedOutput: <T extends DatasetItem>(
        runRecord: RunRecord, pageSize: number, readOptions?: DatasetClientListItemOptions
    ) => AsyncGenerator<T, void, void>
}

/**
 * Creates an Orchestrator object with its context. Use it to run Actors in parallel, calling `startRun`.
 *
 * It is advised to instantiate only one Orchestrator at a time.
 * If using more than one with persistence enabled, pay attention to possible interference.
 *
 * @param orchestratorOptions the global Orchestrator options
 * @returns the Orchestrator object
 */
export async function createOrchestrator(orchestratorOptions: Partial<OrchestratorOptions> = {}): Promise<ApifyOrchestrator> {
    const {
        enableLogs,
        statsIntervalSec,
        persistSupport,
        persistPrefix,
        abortAllRunsOnGracefulAbort: abortAllRunsOnAbort,
    } = { ...DEFAULT_OPTIONS, ...orchestratorOptions };

    const logger = getLogger(enableLogs);
    const tracker = await getRunsTracker(persistSupport, persistPrefix);

    const runRequestsManager = new RunRequestsManager();

    // Main loop
    const mainLoopId = setInterval(async () => {
        // Check the queue for each account the user would like to run an Actor on
        await Promise.all(runRequestsManager.accountTokens.map(async (tokenKey) => {
            // If the queue is empty, skip
            if (runRequestsManager.length(tokenKey) === 0) { return; }

            const nextRunRequest = runRequestsManager.peek(tokenKey);
            if (!nextRunRequest) { return; }

            // Check if the next Run has enough memory available
            const availableMemoryGBs = await getAvailableMemoryGBs(nextRunRequest.apifyToken);
            let requiredMemoryMBs = nextRunRequest.options?.memory;
            if (!requiredMemoryMBs) {
                const defaultOptions = await getDefaultRunOptions(
                    logger,
                    nextRunRequest.actorId,
                    nextRunRequest.apifyToken,
                );

                // If the user didn't provide a memory option and the default options cannot be read,
                // set the requirement to zero
                requiredMemoryMBs = defaultOptions?.memoryMbytes ?? 0;
            }
            const hasEnoughMemory = availableMemoryGBs >= requiredMemoryMBs / 1024;

            // Start the next run
            if (hasEnoughMemory) {
                const runToTrigger = runRequestsManager.dequeue(tokenKey);
                if (!runToTrigger) { return; }
                try {
                    const nextRun = await startAndTrackRun(logger, tracker, runToTrigger);
                    runToTrigger.onStart.map((callback) => callback(nextRun));
                } catch (err) {
                    log.exception(err as Error, 'Error starting the Run', { runName: runToTrigger.runName });
                    runToTrigger.onStart.map((callback) => callback(null));
                }
            }
        }));
    }, MAIN_LOOP_INTERVAL_MS);

    const statsId = statsIntervalSec ? setInterval(() => {
        if (Object.keys(tracker.runs).length === 0) {
            log.info('ORchestrator report: no Runs yet');
            return;
        }

        const report: Record<string, string[]> = {};

        for (const [runName, { status }] of Object.entries(tracker.runs)) {
            if (!report[status]) {
                report[status] = [];
            }
            report[status].push(runName);
        }

        const formattedReport = Object.entries(report)
            .map(([status, names]) => `    ${status}: ${names.join(', ')}`)
            .join('\n');

        log.info(`Orchestrator report:\n${formattedReport}`);
    }, statsIntervalSec * 1000) : undefined;

    function exitOrchestrator() {
        // Stop the main loop
        clearInterval(mainLoopId);

        // Stop the stats logger
        if (statsId) { clearInterval(statsId); }

        // Empty the queues and unlock all the callers waiting
        for (const apifyToken of runRequestsManager.accountTokens) {
            while (runRequestsManager.length(apifyToken) > 0) {
                runRequestsManager.dequeue(apifyToken)?.onStart.map((callback) => callback(null));
            }
        }
    }

    async function abortAllRuns() {
        // As soon as a Run has started, the returned status is "READY"
        const runNames = tracker.runNamesByStatus('READY', 'RUNNING');
        log.info('Aborting runs...', { runNames });
        await Promise.all(runNames.map(async (runName) => {
            try {
                await abortAndTrackRun(logger, tracker, runName);
            } catch (err) {
                log.exception(err as Error, 'Error aborting the Run', { runName });
            }
        }));
    }

    Actor.on('aborting', async () => {
        exitOrchestrator();
        if (abortAllRunsOnAbort) {
            await abortAllRuns();
        }
    });
    Actor.on('exit', () => {
        exitOrchestrator();
    });
    Actor.on('migrating', () => {
        exitOrchestrator();
    });

    function enqueueRun(runRequest: RunRequest) {
        const { runName } = runRequest;
        logger.prfxInfo(runName, 'Enqueuing run');

        if (tracker.runs[runName]) {
            logger.prfxWarn(runName, 'Enqueuing a Run which has already started');
            return false;
        }

        const existingRunRequest = runRequestsManager.find(runName);
        if (existingRunRequest) {
            logger.prfxWarn(runName, 'This run was already enqueued');
            return false;
        }

        runRequestsManager.enqueue(runRequest);
        return true;
    }

    function enqueue(...runRequests: RunRequest[]) {
        const successfullyEnqueued: string[] = [];
        for (const runRequest of runRequests) {
            const success = enqueueRun(runRequest);
            if (success) { successfullyEnqueued.push(runRequest.runName); }
        }
        return successfullyEnqueued;
    }

    async function startRun(runRequest: RunRequest) {
        const { runName } = runRequest;
        logger.prfxInfo(runName, 'Waiting for Run to start');

        const startedRun = await getRun(tracker, runName);
        if (startedRun) {
            logger.prfxInfo(runName, 'Starting a Run which has already started: ignoring new parameters.');
            return startedRun;
        }

        const existingRunRequest = runRequestsManager.find(runName);
        if (existingRunRequest) {
            logger.prfxInfo(runName, 'Starting a Run which was already enqueued: ignoring new parameters.');
            return waitForRequest(existingRunRequest);
        }

        return await new Promise<ActorRun | null>((resolve) => {
            runRequestsManager.enqueue(runRequest, (run) => resolve(run));
        });
    }

    async function start(...runRequests: RunRequest[]) {
        const runRecord: RunRecord = {};
        await Promise.all(runRequests.map(
            async (runRequest) => startRun(runRequest).then((run) => { runRecord[runRequest.runName] = run; }),
        ));
        return runRecord;
    }

    async function waitRunStart(runName: string) {
        const existingRunRequest = runRequestsManager.find(runName);
        if (existingRunRequest) { return waitForRequest(existingRunRequest); }

        const existingRun = await getRun(tracker, runName);
        if (!existingRun) { logger.prfxWarn(runName, 'Waiting to start a Run not found.'); }
        return existingRun;
    }

    async function waitStart(...runNames: string[]) {
        const runRecord: RunRecord = {};
        await Promise.all(runNames.map(
            async (runName) => waitRunStart(runName).then((run) => { runRecord[runName] = run; }),
        ));
        return runRecord;
    }

    async function waitRunFinish(runName: string) {
        const runRequest = runRequestsManager.find(runName);
        if (runRequest) { await waitForRequest(runRequest); }
        return await waitAndTrackRun(logger, tracker, runName);
    }

    async function waitFinish(...runNames: string[]) {
        const runRecord: RunRecord = {};
        await Promise.all(runNames.map(
            async (runName) => waitRunFinish(runName).then((run) => { runRecord[runName] = run; }),
        ));
        return runRecord;
    }

    async function startAndWaitRunFinish(runRequest: RunRequest) {
        const startedRun = await startRun(runRequest);
        if (!startedRun) { return null; }
        return await waitRunFinish(runRequest.runName);
    }

    async function startAndWaitFinish(...runRequests: RunRequest[]) {
        const runRecord: RunRecord = {};
        await Promise.all(runRequests.map(
            async (runRequest) => startAndWaitRunFinish(runRequest).then((run) => { runRecord[runRequest.runName] = run; }),
        ));
        return runRecord;
    }

    async function* iteratePaginatedOutput<T extends DatasetItem>(
        runRecord: RunRecord,
        pageSize: number,
        readOptions?: DatasetClientListItemOptions,
    ): AsyncGenerator<T, void, void> {
        for (const [runName, run] of Object.entries(runRecord)) {
            if (!run) { continue; }
            logger.prfxInfo(runName, 'Reading default dataset');
            const datasetIterator = iteratePaginatedDataset<T>(run.defaultDatasetId, pageSize, readOptions);
            for await (const item of datasetIterator) {
                yield item;
            }
        }
    }

    return {
        enqueue,
        start,
        waitStart,
        waitFinish,
        startAndWaitFinish,
        iteratePaginatedOutput,
    };
}
