import { Actor } from 'apify';
import { type ActorRun, ApifyClient, type ApifyClientOptions, type RunClient } from 'apify-client';

import type { ClientContext } from '../context/client-context.js';
import type { RunStartRequest } from '../run-scheduler.js';
import type { DatasetItem, ExtendedApifyClient, RunRecord } from '../types.js';
import { isRunOkStatus } from '../utils/apify-client.js';
import { ExtActorClient } from './actor-client.js';
import { ExtDatasetClient } from './dataset-client.js';
import type { ExtRunClient } from './run-client.js';
import { ExtTaskClient } from './task-client.js';

export class ExtApifyClient extends ApifyClient implements ExtendedApifyClient {
    public readonly clientName: string;
    private readonly context: ClientContext;

    /**
     * @internal
     */
    constructor(clientName: string, context: ClientContext, superClientOptions: ApifyClientOptions) {
        super(superClientOptions);
        this.clientName = clientName;
        this.context = context;

        if (context.options.abortAllRunsOnGracefulAbort) {
            Actor.on('aborting', this.abortAllRuns.bind(this));
        }
    }

    override actor(id: string): ExtActorClient {
        return new ExtActorClient(this.context, this, super.actor(id));
    }

    override task(id: string): ExtTaskClient {
        return new ExtTaskClient(this.context, this, super.task(id));
    }

    override dataset<T extends DatasetItem>(id: string): ExtDatasetClient<T> {
        return new ExtDatasetClient<T>(this.context, super.dataset(id));
    }

    override run(id: string): RunClient {
        const runName = this.context.runTracker.findRunName(id);
        const runClient = super.run(id);
        return runName ? this.context.extendRunClient(runName, runClient) : runClient;
    }

    async runByName(runName: string): Promise<ExtRunClient | undefined> {
        return this.context.searchExistingRun(runName).match({
            promise: async (waitForStart) =>
                waitForStart().then((run) => this.context.extendRunClient(runName, super.run(run.id))),
            runInfo: async (runInfo) => this.context.extendRunClient(runName, super.run(runInfo.runId)),
            notFound: () => undefined,
        });
    }

    async actorRunByName(runName: string): Promise<ActorRun | undefined> {
        return this.context.searchExistingRun(runName).match({
            promise: async (waitForStart) => waitForStart(),
            runInfo: async (runInfo) => this.context.extendRunClient(runName, super.run(runInfo.runId)).get(),
            notFound: () => undefined,
        });
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
                const resultRun = await this.context.extendRunClient(runName, super.run(run.id)).waitForFinish();
                resultRunRecord[runName] = resultRun;
            }),
        );

        return resultRunRecord;
    }

    async abortAllRuns(): Promise<void> {
        const currentRuns = this.context.runTracker.getCurrentRuns();
        this.context.logger.info('Aborting Runs', { currentRunNames: Object.keys(currentRuns) });
        await Promise.all(
            Object.entries(currentRuns).map(async ([runName, runInfo]) => {
                const runClient = this.context.extendRunClient(runName, super.run(runInfo.runId));
                this.context.logger.prefixed(runName).info('Aborting Run', {}, { url: runInfo.runUrl });
                await runClient.abort().catch((error) => {
                    this.context.logger.prefixed(runName).error('Error aborting Run', { error });
                });
            }),
        );
    }

    /** @internal */
    extendedRunClient(runName: string, runId: string): ExtRunClient {
        const runClient = super.run(runId);
        return this.context.extendRunClient(runName, runClient);
    }

    /**
     * Finds an existing Run by name or requests to start a new one if none exists or the existing one is not in an OK status.
     *
     * @returns a handle to wait for the Run to start.
     *
     * @internal
     */
    findOrRequestRunStart(runRequest: RunStartRequest): () => Promise<ActorRun> {
        return this.context.searchExistingRun(runRequest.name).match({
            promise: (waitForStart) => waitForStart,
            runInfo: (runInfo) => {
                if (isRunOkStatus(runInfo.status)) {
                    return async () => this.getRunObjectOrStartNew(runRequest, runInfo.runId);
                }
                // If the existing Run is not in an OK status, we start a new one.
                return this.context.runScheduler.requestRunStart(runRequest);
            },
            notFound: () => this.context.runScheduler.requestRunStart(runRequest),
        });
    }

    /**
     * Finds an existing Run by name or starts a new one if none exists or the existing one is not in an OK status.
     *
     * @returns the new or existing Run after it has started.
     *
     * @internal
     */
    async findOrStartRun(runRequest: RunStartRequest): Promise<ActorRun> {
        return this.context.searchExistingRun(runRequest.name).match({
            promise: async (waitForStart) => waitForStart(),
            runInfo: async (runInfo) => {
                if (isRunOkStatus(runInfo.status)) {
                    return this.getRunObjectOrStartNew(runRequest, runInfo.runId);
                }
                // If the existing Run is not in an OK status, we start a new one.
                return this.context.runScheduler.startRun(runRequest);
            },
            notFound: async () => this.context.runScheduler.startRun(runRequest),
        });
    }

    private async getRunObjectOrStartNew(runRequest: RunStartRequest, existingRunId: string): Promise<ActorRun> {
        const existingRun = await this.context.extendRunClient(runRequest.name, super.run(existingRunId)).get();
        if (existingRun) return existingRun;
        // If the Run client could not retrieve the Run object, we proceed to start a new one.
        return this.context.runScheduler.startRun(runRequest);
    }
}
