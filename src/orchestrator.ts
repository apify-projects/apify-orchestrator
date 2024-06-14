import { Actor, ActorRun, log } from 'apify';

import { abortAndTrackRun, getDefaultRunOptions, getRun, startAndTrackRun, waitAndTrackRun } from './client.js';
import { getLogger } from './logging.js';
import { ActorParams, RunRequest, createRequestsManager } from './run-request.js';
import { getRunsTracker } from './tracking.js';
import { getAvailableMemoryGBs } from './utils/apify-api.js';
import { PersistSupport } from './utils/persist.js';

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

export interface ApifyOrchestrator {
    /**
     * Enqueues a Run request in the Orchestrator and returns immediately.
     *
     * You can check the Run's status later with its `runName`, executing:
     *
     * - `waitRunStart` to wait for the Run to start.
     * - `waitRun` to wait for the Run to finish.
     *
     * @param runName A unique identifier for this Run.
     * @param actorId The Actor ID on the Apify platform.
     * @param actorParams Other Actor parameters to start the Run.
     * @returns `true` if the Run was correctly enqueued, `false` if a Run with the same name was already enqueued.
     */
    enqueueRun: (runName: string, actorId: string, actorParams?: ActorParams) => boolean

    /**
     * Runs an Actor through the Orchestrator:
     *
     * - Checks whether enough memory is available on the account which will run the Actor, otherwise hangs until it is.
     * - Logs information about the run's status (if enabled in the options).
     * - Persists the run's information for debugging and to restore it in case of resurrection (if enabled in the options).
     * - Abort all the runs started with this command on graceful abort (if enabled in the options)
     *
     * If use don't care about the Run object before the Run has finished, use `startAndWaitRun`, instead.
     *
     * @param runName A unique identifier for this Run.
     * @param actorId The Actor ID on the Apify platform.
     * @param actorParams Other Actor parameters to start the Run.
     * @returns the Run object, or `null` if starting the Run failed or the orchestrator is shutting down.
     */
    startRun: (runName: string, actorId: string, actorParams?: ActorParams) => Promise<ActorRun | null>

    /**
     * Waits for a Run to start and return the Run object.
     *
     * You must call `enqueueRun` before calling this function.
     *
     * @param runName The unique identifier used to start the Run.
     * @returns the Run object, `null` in case of error, e.g., if a Run was awaited before starting it.
     */
    waitRunStart: (runName: string) => Promise<ActorRun | null>

    /**
     * Waits for a Run to finish and return the Run object.
     *
     * You must call `startRun` before calling this function.
     * If you don't care about the Run object before the Run has finished, you can use `startAndWaitRun`.
     *
     * @param runName The unique identifier used to start the Run.
     * @returns the Run object, `null` in case of error, e.g., if a Run was awaited before starting it.
     */
    waitRun: (runName: string) => Promise<ActorRun | null>

    /**
     * Utility to start and wait a Run at once.
     *
     * Equals executing `startRun` and then `waitRun`.
     *
     * @param runName A unique identifier for this Run.
     * @param actorId The Actor ID on the Apify platform.
     * @param actorParams Other Actor parameters to start the Run.
     * @returns the Run object, or `null` if starting the Run failed or the orchestrator is shutting down.
     */
    startAndWaitRun: (runName: string, actorId: string, actorParams?: ActorParams) => Promise<ActorRun | null>
}

/**
 * Creates an Orchestrator object with its context. Use it to run Actors in parallel, calling `startRun`.
 *
 * It is advised to instantiate only one Orchestrator at a time.
 * If using more than one with persistence enabled, pay attention to possible interference.
 *
 * @param options the global Orchestrator options
 * @returns the Orchestrator object
 */
export async function createOrchestrator(options: Partial<OrchestratorOptions> = {}): Promise<ApifyOrchestrator> {
    const {
        enableLogs,
        statsIntervalSec,
        persistSupport,
        persistPrefix,
        abortAllRunsOnGracefulAbort: abortAllRunsOnAbort,
    } = { ...DEFAULT_OPTIONS, ...options };

    const logger = getLogger(enableLogs);
    const tracker = await getRunsTracker(persistSupport, persistPrefix);

    const runRequestsManager = createRequestsManager();

    // Main loop
    const mainLoopId = setInterval(async () => {
        // Check the queue for each account the user would like to run an Actor on
        await Promise.all(runRequestsManager.accountTokens.map(async (tokenKey) => {
            // If the queue is empty, skip
            if (runRequestsManager.length(tokenKey) === 0) { return; }

            const nextRunRequest = runRequestsManager.peek(tokenKey);
            if (!nextRunRequest) { return; }

            // Check if the next Run has enough memory available
            const availableMemoryGBs = await getAvailableMemoryGBs(nextRunRequest.actorParams?.apifyToken);
            let requiredMemoryMBs = nextRunRequest.actorParams?.options?.memory;
            if (!requiredMemoryMBs) {
                const defaultOptions = await getDefaultRunOptions(
                    logger,
                    nextRunRequest.actorId,
                    nextRunRequest.actorParams?.apifyToken,
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
                const { runName, actorId, actorParams } = runToTrigger;
                try {
                    const nextRun = await startAndTrackRun(
                        logger,
                        tracker,
                        runName,
                        actorId,
                        actorParams?.input,
                        actorParams?.options,
                        actorParams?.apifyToken,
                    );
                    runToTrigger.onStart.map((callback) => callback(nextRun));
                } catch (err) {
                    log.exception(err as Error, 'Error starting the Run', { runName });
                    runToTrigger.onStart.map((callback) => callback(null));
                }
            }
        }));
    }, 1000);

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

    /**
     * Awaits for a RunRequest to be dequeued and started.
     */
    const waitForRequest = async (runRequest: RunRequest) => new Promise<ActorRun | null>((resolve) => {
        runRequest.onStart.push((run) => resolve(run));
    });

    const enqueueRun = (runName: string, actorId: string, actorParams?: ActorParams) => {
        logger.prfxInfo(runName, 'Enqueuing run');

        if (tracker.runs[runName]) {
            logger.prfxWarn(runName, 'Enqueuing a Run which has already started');
            return false;
        }

        const alreadyExistingRunRequest = runRequestsManager.find(runName);
        if (alreadyExistingRunRequest) {
            logger.prfxWarn(runName, 'This run was already enqueued');
            return false;
        }

        runRequestsManager.enqueue(actorParams?.apifyToken, { runName, actorId, actorParams, onStart: [] });
        return true;
    };

    const startRun = async (runName: string, actorId: string, actorParams?: ActorParams) => {
        logger.prfxInfo(runName, 'Waiting for Run to start');

        const startedRun = await getRun(tracker, runName);
        if (startedRun) {
            logger.prfxInfo(runName, 'Starting a Run which has already started: ignoring new parameters.');
            return startedRun;
        }

        const runRequest = runRequestsManager.find(runName);
        if (runRequest) {
            logger.prfxInfo(runName, 'Starting a Run which was already enqueued: ignoring new parameters.');
            return waitForRequest(runRequest);
        }

        return await new Promise<ActorRun | null>((resolve) => {
            runRequestsManager.enqueue(
                actorParams?.apifyToken,
                { runName, actorId, actorParams, onStart: [(run) => resolve(run)] },
            );
        });
    };

    const waitRunStart = async (runName: string) => {
        const runRequest = runRequestsManager.find(runName);
        if (runRequest) { return waitForRequest(runRequest); }

        const run = await getRun(tracker, runName);
        if (!run) { logger.prfxWarn(runName, 'Waiting to start a Run not found.'); }
        return run;
    };

    const waitRun = async (runName: string) => {
        const runRequest = runRequestsManager.find(runName);
        if (runRequest) { await waitForRequest(runRequest); }
        return await waitAndTrackRun(logger, tracker, runName);
    };

    return {
        enqueueRun,
        startRun,
        waitRunStart,
        waitRun,
        startAndWaitRun: async (runName: string, actorId: string, actorParams?: ActorParams) => {
            const startedRun = await startRun(runName, actorId, actorParams);
            if (!startedRun) { return null; }
            return await waitRun(runName);
        },
    };
}
