import { Actor, ApifyClient, log } from 'apify';
import type { ActorRun, ApifyClientOptions, RunClient } from 'apify-client';

import { MAIN_LOOP_COOLDOWN_MS, MAIN_LOOP_INTERVAL_MS, RUN_STATUSES } from '../constants.js';
import { InsufficientActorJobsError, InsufficientMemoryError } from '../errors.js';
import { isRunOkStatus } from '../tracker.js';
import type {
    DatasetItem,
    EnqueuedRequest,
    ExtActorClientOptions,
    ExtendedApifyClient,
    ExtTaskClientOptions,
    RunRecord,
    RunResult,
} from '../types.js';
import { parseStartRunError } from '../utils/apify-client.js';
import type { OrchestratorContext } from '../utils/context.js';
import { Queue } from '../utils/queue.js';
import { ExtActorClient } from './actor-client.js';
import { ExtDatasetClient } from './dataset-client.js';
import type { ExtRunClientOptions } from './run-client.js';
import { ExtRunClient } from './run-client.js';
import { ExtTaskClient } from './task-client.js';

export interface ExtApifyClientOptions {
    clientName: string;
    fixedInput?: object;
    abortAllRunsOnGracefulAbort: boolean;
    hideSensitiveInformation: boolean;
    retryOnInsufficientResources: boolean;
}

export class ExtApifyClient extends ApifyClient implements ExtendedApifyClient {
    protected context: OrchestratorContext;

    readonly clientName: string;
    readonly abortAllRunsOnGracefulAbort: boolean;
    readonly hideSensitiveInformation: boolean;
    readonly fixedInput: object | undefined; // TODO: forbid changes
    readonly retryOnInsufficientResources: boolean;

    protected runRequestsQueue = new Queue<EnqueuedRequest>();

    protected mainLoopId: NodeJS.Timeout | undefined;
    protected mainLoopLock = false;
    protected mainLoopCooldown = 0;

    constructor(
        context: OrchestratorContext,
        options: ExtApifyClientOptions,
        superClientOptions: ApifyClientOptions = {},
    ) {
        const {
            clientName,
            fixedInput,
            abortAllRunsOnGracefulAbort,
            hideSensitiveInformation,
            retryOnInsufficientResources,
        } = options;
        super({
            ...superClientOptions,
            token: superClientOptions.token ?? Actor.apifyClient.token,
        });
        this.context = context;
        this.clientName = clientName;
        this.hideSensitiveInformation = hideSensitiveInformation;
        this.fixedInput = fixedInput;
        this.abortAllRunsOnGracefulAbort = abortAllRunsOnGracefulAbort;
        this.retryOnInsufficientResources = retryOnInsufficientResources;
    }

    protected trackedRun(runName: string, id: string) {
        const runClientOptions: ExtRunClientOptions = { runName };
        return new ExtRunClient(this.context, runClientOptions, super.run(id));
    }

    protected enqueue(runRequest: EnqueuedRequest, force: true): undefined;
    protected enqueue(runRequest: EnqueuedRequest, force: false): ExtRunClient | undefined;
    protected enqueue(runRequest: EnqueuedRequest, force = false): ExtRunClient | undefined {
        const { runName } = runRequest;

        if (!force) {
            const existingRunInfo = this.context.runTracker.findRunByName(runName);

            // If the Run exists and has not failed, keep it
            if (existingRunInfo && isRunOkStatus(existingRunInfo.status)) {
                return this.trackedRun(runName, existingRunInfo.runId);
            }
        }

        if (this.mainLoopId === undefined) {
            // Avoid blocking if the orchestrator is not running
            for (const callback of runRequest.startCallbacks) {
                callback({ kind: RUN_STATUSES.ERROR, error: new Error('Orchestrator is not running') });
            }
            return undefined;
        }

        this.context.logger.prefixed(runRequest.runName).info('Enqueuing Run request');
        this.runRequestsQueue.enqueue(runRequest);
        return undefined;
    }

    protected async findAndWaitForRunRequest(runName: string): Promise<ActorRun | undefined> {
        let result: ActorRun | undefined;

        let startPromise: Promise<RunResult> | undefined;
        const runRequest = this.runRequestsQueue.find((req) => req.runName === runName);
        if (runRequest) {
            startPromise = new Promise<RunResult>((resolve) => {
                runRequest.startCallbacks.push(resolve);
            });
        }

        if (startPromise) {
            const runResult = await startPromise;
            if (runResult.kind === RUN_STATUSES.ERROR) {
                this.context.logger.prefixed(runName).error('Error starting Run from queue', {
                    message: runResult.error.message,
                });
                throw new Error(`Error starting Run: ${runName}. ${runResult.error.message}`);
            }
            if (runResult.kind === RUN_STATUSES.IN_PROGRESS) {
                throw new Error(`Error starting Run: ${runName}.`);
            }
            result = runResult.run;
        }

        return result;
    }

    protected findStartedRun(runName: string): ExtRunClient | undefined {
        const startedRunInfo = this.context.runTracker.currentRuns[runName];
        if (startedRunInfo) {
            return this.trackedRun(runName, startedRunInfo.runId);
        }
        return undefined;
    }

    override actor(id: string): ExtActorClient {
        const actorClientOptions: ExtActorClientOptions = {
            enqueueRunOnApifyAccount: (runRequest) => this.enqueue(runRequest, false),
            forceEnqueueRunOnApifyAccount: (runRequest) => this.enqueue(runRequest, true),
            fixedInput: this.fixedInput,
        };
        return new ExtActorClient(this.context, actorClientOptions, super.actor(id));
    }

    override task(id: string): ExtTaskClient {
        const taskClientOptions: ExtTaskClientOptions = {
            enqueueRunOnApifyAccount: (runRequest) => this.enqueue(runRequest, false),
            forceEnqueueRunOnApifyAccount: (runRequest) => this.enqueue(runRequest, true),
            fixedInput: this.fixedInput,
        };
        return new ExtTaskClient(this.context, taskClientOptions, super.task(id));
    }

    override dataset<T extends DatasetItem>(id: string): ExtDatasetClient<T> {
        return new ExtDatasetClient<T>(this.context, super.dataset(id));
    }

    override run(id: string): RunClient {
        const runName = this.context.runTracker.findRunName(id);
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
        this.context.logger.info("Starting Apify client's scheduler", { clientName: this.clientName });

        // Do not allow more than one main loop operation to execute at once.
        const withMainLoopLock = (op: () => Promise<void>) => async () => {
            if (this.mainLoopCooldown > 0) {
                this.mainLoopCooldown -= MAIN_LOOP_INTERVAL_MS;
                return;
            }

            if (this.mainLoopLock) {
                return;
            }

            this.mainLoopLock = true;
            await op();
            this.mainLoopLock = false;
        };

        // Main loop
        this.mainLoopId = setInterval(
            withMainLoopLock(async () => {
                const nextRunRequest = this.runRequestsQueue.dequeue();
                if (!nextRunRequest) {
                    return;
                }

                const getRequiredMemoryMbytes = async () =>
                    nextRunRequest.options?.memory ??
                    (await nextRunRequest.defaultMemoryMbytes()) ??
                    // If no information about memory is available, set the requirement to zero.
                    0;

                const { runName, input, options } = nextRunRequest;

                this.context.logger.prefixed(runName).info('Starting next', { queue: this.runRequestsQueue.length });

                let result: RunResult;

                try {
                    const run = await nextRunRequest.startRun(input, options);
                    result = { kind: RUN_STATUSES.RUN_STARTED, run };
                } catch (startError) {
                    this.context.logger.prefixed(runName).error('Failed to start Run', {
                        message: (startError as Error)?.message,
                    });
                    const error = await parseStartRunError(startError, runName, getRequiredMemoryMbytes);
                    result = { kind: RUN_STATUSES.ERROR, error };
                }

                if (result.kind === RUN_STATUSES.RUN_STARTED) {
                    await this.context.runTracker.updateRun(runName, result.run);
                    for (const callback of nextRunRequest.startCallbacks) {
                        callback({ kind: RUN_STATUSES.RUN_STARTED, run: result.run });
                    }
                } else if (
                    this.retryOnInsufficientResources &&
                    result.kind === RUN_STATUSES.ERROR &&
                    (result.error instanceof InsufficientMemoryError ||
                        result.error instanceof InsufficientActorJobsError)
                ) {
                    this.context.logger.info(
                        `Not enough resources: waiting ${MAIN_LOOP_COOLDOWN_MS}ms before trying again`,
                    );
                    this.runRequestsQueue.prepend(nextRunRequest);
                    this.mainLoopCooldown = MAIN_LOOP_COOLDOWN_MS;
                } else {
                    for (const callback of nextRunRequest.startCallbacks) {
                        callback({ kind: RUN_STATUSES.ERROR, error: result.error });
                    }
                }
            }),
            MAIN_LOOP_INTERVAL_MS,
        );

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
        this.context.logger.info("Stopping Apify client's scheduler", { clientName: this.clientName });

        // Stop the main loop
        if (this.mainLoopId) {
            clearInterval(this.mainLoopId);
            this.mainLoopId = undefined;
        }

        // Empty the queues and unlock all the callers waiting
        while (this.runRequestsQueue.length > 0) {
            this.runRequestsQueue
                .dequeue()
                ?.startCallbacks.map((callback) =>
                    callback({ kind: RUN_STATUSES.ERROR, error: new Error('Scheduler stopped') }),
                );
        }
    }

    // Public methods.

    async runByName(runName: string): Promise<ExtRunClient | undefined> {
        let id: string | undefined;

        const run = await this.findAndWaitForRunRequest(runName);
        if (run) {
            id = run.id;
        }

        const startedRunClient = this.findStartedRun(runName);
        if (startedRunClient) {
            id = startedRunClient.id;
        }

        if (!id) {
            return undefined;
        }

        return this.trackedRun(runName, id);
    }

    async actorRunByName(runName: string): Promise<ActorRun | undefined> {
        const run = await this.findAndWaitForRunRequest(runName);
        if (run) {
            return run;
        }

        const runClient = this.findStartedRun(runName);
        if (runClient) {
            return runClient.get();
        }

        return undefined;
    }

    async runRecord(...runNames: string[]): Promise<RunRecord> {
        const runRecord: RunRecord = {};
        await Promise.all(
            runNames.map(async (runName) => {
                const run = await this.actorRunByName(runName);
                if (run) {
                    runRecord[runName] = run;
                }
            }),
        );
        return runRecord;
    }

    async waitForBatchFinish(batch: RunRecord | string[]): Promise<RunRecord> {
        const runRecord = Array.isArray(batch) ? await this.runRecord(...batch) : batch;
        this.context.logger.info('Waiting for batch', { runNames: Object.keys(runRecord) });

        const resultRunRecord: RunRecord = {};

        await Promise.all(
            Object.entries(runRecord).map(async ([runName, run]) => {
                const resultRun = await this.trackedRun(runName, run.id).waitForFinish();
                resultRunRecord[runName] = resultRun;
            }),
        );

        return resultRunRecord;
    }

    async abortAllRuns() {
        log.info('Aborting runs', this.context.runTracker.currentRuns);
        await Promise.all(
            Object.entries(this.context.runTracker.currentRuns).map(async ([runName, runInfo]) => {
                try {
                    await this.trackedRun(runName, runInfo.runId).abort();
                } catch (err) {
                    log.exception(err as Error, 'Error aborting the Run', { runName });
                }
            }),
        );
    }
}
