import { Actor } from 'apify';
import type { ApifyClientOptions, RunClient } from 'apify-client';
import { ApifyClient } from 'apify-client';

import type { ClientContext } from '../context/client-context.js';
import { getRequestId, type RunStartRequest } from '../run-scheduler.js';
import type { DatasetItem, ExtendedActorRun, ExtendedApifyClient } from '../types.js';
import { isRunOkStatus } from '../utils/apify-client.js';
import { isDefined } from '../utils/typing.js';
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
        const requestId = this.context.runTracker.findRunRequestId(id);
        const runClient = super.run(id);
        return isDefined(requestId) ? this.context.extendRunClient(requestId, runClient) : runClient;
    }

    async runByName(runName: string): Promise<ExtRunClient | undefined> {
        return this.context.searchExistingRun(runName).match({
            promise: async (waitForStart) =>
                waitForStart().then((run) => this.context.extendRunClient(runName, super.run(run.id))),
            runInfo: async (runInfo) => this.context.extendRunClient(runName, super.run(runInfo.runId)),
            notFound: () => undefined,
        });
    }

    async actorRunByName(runName: string): Promise<ExtendedActorRun | undefined> {
        return this.context.searchExistingRun(runName).match({
            promise: async (waitForStart) => waitForStart(),
            runInfo: async (runInfo) => this.context.extendRunClient(runName, super.run(runInfo.runId)).get(),
            notFound: () => undefined,
        });
    }

    async actorRunsByName(...runNames: string[]): Promise<ExtendedActorRun[]> {
        const runs = await Promise.all(runNames.map(async (runName) => this.actorRunByName(runName)));
        return runs.filter(isDefined);
    }

    async waitForBatchFinish(batch: ExtendedActorRun[] | string[]): Promise<ExtendedActorRun[]> {
        const runs = isStringArray(batch) ? await this.actorRunsByName(...batch) : batch;
        this.context.logger.info('Waiting for batch', { requestIds: runs.map(({ requestId }) => requestId) });

        return Promise.all(
            runs.map(async (run) => this.context.extendRunClient(run.requestId, super.run(run.id)).waitForFinish()),
        );
    }

    async abortAllRuns(): Promise<void> {
        const currentRuns = this.context.runTracker.getCurrentRuns();
        this.context.logger.info('Aborting Runs', { currentRunNames: Object.keys(currentRuns) });
        await Promise.all(
            Object.entries(currentRuns).map(async ([requestId, runInfo]) => {
                const runClient = this.context.extendRunClient(requestId, super.run(runInfo.runId));
                this.context.logger.prefixed(requestId).info('Aborting Run', {}, { url: runInfo.runUrl });
                await runClient.abort().catch((error) => {
                    this.context.logger.prefixed(requestId).error('Error aborting Run', { error });
                });
            }),
        );
    }

    /** @internal */
    extendedRunClient(requestId: string, runId: string): ExtRunClient {
        const runClient = super.run(runId);
        return this.context.extendRunClient(requestId, runClient);
    }

    /**
     * Finds an existing Run by name or requests to start a new one if none exists or the existing one is not in an OK status.
     *
     * @returns a handle to wait for the Run to start.
     *
     * @internal
     */
    findOrRequestRunStart(runRequest: RunStartRequest): () => Promise<ExtendedActorRun> {
        const requestId = getRequestId(runRequest);
        return this.context.searchExistingRun(requestId).match({
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
    async findOrStartRun(runRequest: RunStartRequest): Promise<ExtendedActorRun> {
        const requestId = getRequestId(runRequest);
        return this.context.searchExistingRun(requestId).match({
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

    private async getRunObjectOrStartNew(
        runRequest: RunStartRequest,
        existingRunId: string,
    ): Promise<ExtendedActorRun> {
        const requestId = getRequestId(runRequest);
        const existingRun = await this.context.extendRunClient(requestId, super.run(existingRunId)).get();
        if (existingRun) return existingRun;
        // If the Run client could not retrieve the Run object, we proceed to start a new one.
        return this.context.runScheduler.startRun(runRequest);
    }
}

function isStringArray(array: ExtendedActorRun[] | string[]): array is string[] {
    return array.every((item) => typeof item === 'string');
}
