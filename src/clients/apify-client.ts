import { Actor, ApifyClient, log } from 'apify';
import { ActorRun, ApifyClientOptions, RunClient } from 'apify-client';

import { EnqueuedRequest, ExtActorClient } from './actor-client.js';
import { ExtDatasetClient } from './dataset-client.js';
import { ExtRunClient } from './run-client.js';
import { MAIN_LOOP_COOLDOWN_MS, MAIN_LOOP_INTERVAL_MS } from '../constants.js';
import { RunsTracker, isRunOkStatus } from '../tracker.js';
import { DatasetItem, GreedyIterateOptions, IterateOptions, RunRecord, ScheduledApifyClient, isRunRecord } from '../types.js';
import { getUserLimits } from '../utils/apify-api.js';
import { combineAsyncIterators } from '../utils/iterators.js';
import { CustomLogger } from '../utils/logging.js';
import { Queue } from '../utils/queue.js';

export class ExtApifyClient extends ApifyClient implements ScheduledApifyClient {
    protected runRequestsQueue = new Queue<EnqueuedRequest>();

    protected clientName: string;
    protected customLogger: CustomLogger;
    protected runsTracker: RunsTracker;
    protected hideSensibleInformation: boolean;
    protected enableDatasetTracking: boolean;
    protected fixedInput: object | undefined;
    protected abortAllRunsOnGracefulAbort: boolean;

    protected mainLoopId: NodeJS.Timeout | undefined;
    protected mainLoopLock = false;
    protected mainLoopCooldown = 0;

    constructor(
        clientName: string,
        customLogger: CustomLogger,
        runsTracker: RunsTracker,
        fixedInput: object | undefined,
        abortAllRunsOnGracefulAbort: boolean,
        hideSensibleInformation: boolean,
        enableDatasetTracking: boolean,
        options: ApifyClientOptions = {},
    ) {
        if (!options.token) { options.token = Actor.apifyClient.token; }
        super(options);
        this.clientName = clientName;
        this.customLogger = customLogger;
        this.runsTracker = runsTracker;
        this.hideSensibleInformation = hideSensibleInformation;
        this.enableDatasetTracking = enableDatasetTracking;
        this.fixedInput = fixedInput;
        this.abortAllRunsOnGracefulAbort = abortAllRunsOnGracefulAbort;
    }

    protected trackedRun(runName: string, id: string) {
        return new ExtRunClient(
            super.run(id),
            runName,
            this.customLogger,
            this.runsTracker,
        );
    }

    protected enqueue(runRequest: EnqueuedRequest, force: true): undefined
    protected enqueue(runRequest: EnqueuedRequest, force: false): ExtRunClient | undefined
    protected enqueue(runRequest: EnqueuedRequest, force = false): ExtRunClient | undefined {
        const { runName } = runRequest;

        if (!force) {
            const existingRunInfo = this.runsTracker.findRunByName(runName);

            // If the Run exists and has not failed, keep it
            if (existingRunInfo && isRunOkStatus(existingRunInfo.status)) {
                return this.trackedRun(runName, existingRunInfo.runId);
            }
        }

        if (this.mainLoopId !== undefined) {
            this.customLogger.prfxInfo(runRequest.runName, 'Enqueuing Run request');
            this.runRequestsQueue.enqueue(runRequest);
        } else {
            // Avoid blocking if the orchestrator is not running
            runRequest.startCallbacks.map((callback) => callback(undefined));
        }

        return undefined;
    }

    protected async findAndWaitForRunRequest(runName: string): Promise<ActorRun | undefined> {
        let result: ActorRun | undefined;

        let startPromise: Promise<ActorRun | undefined> | undefined;
        const runRequest = this.runRequestsQueue.find((req) => req.runName === runName);
        if (runRequest) {
            startPromise = new Promise<ActorRun | undefined>((resolve) => {
                runRequest.startCallbacks.push(resolve);
            });
        }

        if (startPromise) {
            const run = await startPromise;
            if (!run) {
                throw new Error(`Error starting Run: ${runName}.`);
            }
            result = run;
        }

        return result;
    }

    protected findStartedRun(runName: string): ExtRunClient | undefined {
        const startedRunInfo = this.runsTracker.currentRuns[runName];
        if (startedRunInfo) {
            return this.trackedRun(runName, startedRunInfo.runId);
        }
        return undefined;
    }

    override actor(id: string): ExtActorClient {
        return new ExtActorClient(
            super.actor(id),
            this.customLogger,
            this.runsTracker,
            (runRequest) => this.enqueue(runRequest, false),
            (runRequest) => this.enqueue(runRequest, true),
            this.fixedInput,
        );
    }

    override dataset<T extends DatasetItem>(id: string): ExtDatasetClient<T> {
        return new ExtDatasetClient<T>(super.dataset(id), this.customLogger, this.runsTracker, this.enableDatasetTracking);
    }

    override run(id: string): RunClient {
        const runName = this.runsTracker.findRunName(id);
        return runName ? this.trackedRun(runName, id) : super.run(id);
    }

    // "Hidden" methods, which are not declared in the public interface.

    /**
     * For testing.
     */
    get isSchedulerLocked(): boolean {
        return this.mainLoopLock;
    }

    startScheduler() {
        this.customLogger.info('Starting Apify client\'s scheduler', { clientName: this.clientName });

        // Do not allow more than one main loop operation to execute at once.
        const withMainLoopLock = (op: () => Promise<void>) => async () => {
            if (this.mainLoopCooldown > 0) {
                this.mainLoopCooldown -= MAIN_LOOP_INTERVAL_MS;
                return;
            }

            if (this.mainLoopLock) { return; }

            this.mainLoopLock = true;
            await op();
            this.mainLoopLock = false;
        };

        // Main loop
        this.mainLoopId = setInterval(withMainLoopLock(async () => {
            const nextRunRequest = this.runRequestsQueue.peek();
            if (!nextRunRequest) { return; }

            const userLimits = await getUserLimits(this.token);

            const requiredMemoryMBs = nextRunRequest.options?.memory
                    ?? await nextRunRequest.defaultMemoryMbytes()
                    // If no information about memory is available, set the requirement to zero.
                    ?? 0;
            const requiredMemoryGBs = requiredMemoryMBs / 1024;
            const availableMemoryGBs = userLimits.maxMemoryGBs - userLimits.currentMemoryUsageGBs;
            const availableActorJobs = userLimits.maxConcurrentActorJobs - userLimits.activeActorJobCount;

            const hasEnoughMemory = availableMemoryGBs - requiredMemoryGBs > 0;
            const canRunMoreActors = availableActorJobs > 0;

            // Start the next run
            if (hasEnoughMemory && canRunMoreActors) {
                const runRequest = this.runRequestsQueue.dequeue();
                if (runRequest) {
                    const { runName, input, options } = runRequest;
                    this.customLogger.prfxInfo(
                        runName,
                        'Starting next',
                        { queue: this.runRequestsQueue.length, requiredMemoryGBs },
                        { availableMemoryGBs },
                    );
                    try {
                        const run = await runRequest.startRun(input, options);
                        await this.runsTracker.updateRun(runName, run);
                        runRequest.startCallbacks.map((callback) => callback(run));
                    } catch (e) {
                        this.customLogger.prfxError(runName, 'Failed to start Run', { message: (e as Error)?.message });
                        runRequest.startCallbacks.map((callback) => callback(undefined));
                    }
                } else {
                    this.customLogger.error('Something wrong with the Apify orchestrator\'s queue!');
                }
            } else {
                // Wait for sometime before checking again
                this.customLogger.info(
                    `Not enough resources: waiting ${MAIN_LOOP_COOLDOWN_MS}ms before trying again`,
                    { availableMemoryGBs, availableActorJobs },
                );
                this.mainLoopCooldown = MAIN_LOOP_COOLDOWN_MS;
            }
        }), MAIN_LOOP_INTERVAL_MS);

        Actor.on('aborting', async () => {
            await this.stopScheduler();
            if (this.abortAllRunsOnGracefulAbort) {
                await this.abortAllRuns();
            }
        });
        Actor.on('exit', async () => {
            await this.stopScheduler();
        });
        Actor.on('migrating', async () => {
            await this.stopScheduler();
        });
    }

    async stopScheduler() {
        this.customLogger.info('Stopping Apify client\'s scheduler', { clientName: this.clientName });

        // Stop the main loop
        if (this.mainLoopId) {
            clearInterval(this.mainLoopId);
            this.mainLoopId = undefined;
        }

        // Empty the queues and unlock all the callers waiting
        while (this.runRequestsQueue.length > 0) {
            this.runRequestsQueue.dequeue()?.startCallbacks.map((callback) => callback(undefined));
        }
    }

    // Public methods.

    async runByName(runName: string): Promise<ExtRunClient | undefined> {
        let id: string | undefined;

        const run = await this.findAndWaitForRunRequest(runName);
        if (run) { id = run.id; }

        const startedRunClient = this.findStartedRun(runName);
        if (startedRunClient) { id = startedRunClient.id; }

        if (!id) { return undefined; }

        return this.trackedRun(runName, id);
    }

    async actorRunByName(runName: string): Promise<ActorRun | undefined> {
        const run = await this.findAndWaitForRunRequest(runName);
        if (run) { return run; }

        const runClient = this.findStartedRun(runName);
        if (runClient) { return runClient.get(); }

        return undefined;
    }

    async runRecord(...runNames: string[]): Promise<RunRecord> {
        const runRecord: RunRecord = {};
        await Promise.all(runNames.map(async (runName) => {
            const run = await this.actorRunByName(runName);
            if (run) { runRecord[runName] = run; }
        }));
        return runRecord;
    }

    async waitForBatchFinish(batch: RunRecord | string[]): Promise<RunRecord> {
        const runRecord = Array.isArray(batch) ? await this.runRecord(...batch) : batch;
        this.customLogger.info('Waiting for batch', { runNames: Object.keys(runRecord) });

        const resultRunRecord: RunRecord = {};

        await Promise.all(Object.entries(runRecord).map(async ([runName, run]) => {
            const resultRun = await this.trackedRun(runName, run.id).waitForFinish();
            resultRunRecord[runName] = resultRun;
        }));

        return resultRunRecord;
    }

    async abortAllRuns() {
        log.info('Aborting runs', this.runsTracker.currentRuns);
        await Promise.all(Object.entries(this.runsTracker.currentRuns).map(async ([runName, runInfo]) => {
            try {
                await this.trackedRun(runName, runInfo.runId).abort();
            } catch (err) {
                log.exception(err as Error, 'Error aborting the Run', { runName });
            }
        }));
    }

    async* iterateOutput<T extends DatasetItem>(
        resource: RunRecord | ActorRun,
        options: IterateOptions,
    ): AsyncGenerator<T, void, void> {
        if (isRunRecord(resource)) {
            for (const [runName, run] of Object.entries(resource)) {
                this.customLogger.prfxInfo(runName, 'Reading default dataset');
                const datasetIterator = this.dataset<T>(run.defaultDatasetId).iterate(options);
                for await (const item of datasetIterator) {
                    yield item;
                }
            }
            return;
        }

        const datasetIterator = this.dataset<T>(resource.defaultDatasetId).iterate(options);
        for await (const item of datasetIterator) {
            yield item;
        }
    }

    async* greedyIterateOutput<T extends DatasetItem>(
        resource: RunRecord | ActorRun,
        options: GreedyIterateOptions,
    ): AsyncGenerator<T, void, void> {
        if (isRunRecord(resource)) {
            const iterators = Object.entries(resource).map(([runName, run]) => {
                this.customLogger.prfxInfo(runName, 'Reading default dataset');
                return this.dataset<T>(run.defaultDatasetId).greedyIterate(options);
            });
            const datasetsIterator = combineAsyncIterators(iterators);
            for await (const item of datasetsIterator) {
                yield item;
            }
            return;
        }

        const datasetIterator = this.dataset<T>(resource.defaultDatasetId).greedyIterate(options);
        for await (const item of datasetIterator) {
            yield item;
        }
    }
}
