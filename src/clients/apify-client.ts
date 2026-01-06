import { Actor, ApifyClient } from 'apify';
import type { ActorRun, ApifyClientOptions, Dictionary, RunClient } from 'apify-client';

import { DEFAULT_SPLIT_RULES } from '../constants.js';
import type { RunStartOptions } from '../entities/run-source.js';
import type { RunScheduler, RunStartRequest } from '../run-scheduler.js';
import type { RunTracker } from '../run-tracker.js';
import type { ActorRunRequest, DatasetItem, ExtendedApifyClient, RunRecord, SplitRules } from '../types.js';
import { isRunOkStatus } from '../utils/apify-client.js';
import { generateInputChunks } from '../utils/bytes.js';
import type { OrchestratorContext } from '../utils/context.js';
import { mergeDictionaries } from '../utils/dictionaries.js';
import { generateRunRequests } from '../utils/run-requests.js';
import type { ExtActorClientContext } from './actor-client.js';
import { ExtActorClient } from './actor-client.js';
import { ExtDatasetClient } from './dataset-client.js';
import { ExtRunClient } from './run-client.js';
import type { ExtTaskClientContext } from './task-client.js';
import { ExtTaskClient } from './task-client.js';

export interface ExtApifyClientContext extends OrchestratorContext {
    runTracker: RunTracker;
    runScheduler: RunScheduler;
}

export interface ExtApifyClientOptions {
    clientName: string;
    fixedInput?: Dictionary;
    abortAllRunsOnGracefulAbort: boolean;
    hideSensitiveInformation: boolean;
    retryOnInsufficientResources: boolean;
}

export class ExtApifyClient extends ApifyClient implements ExtendedApifyClient {
    readonly clientName: string;
    readonly abortAllRunsOnGracefulAbort: boolean;
    readonly hideSensitiveInformation: boolean;
    readonly fixedInput: Dictionary | undefined; // TODO: forbid changes
    readonly retryOnInsufficientResources: boolean;

    /**
     * @internal
     */
    constructor(
        private readonly context: ExtApifyClientContext,
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

        if (this.abortAllRunsOnGracefulAbort) {
            Actor.on('aborting', async () => {
                await this.abortAllRuns();
            });
        }
    }

    override actor(id: string): ExtActorClient {
        const actorClientContext: ExtActorClientContext = {
            ...this.context,
            apifyClient: this,
        };
        return new ExtActorClient(actorClientContext, super.actor(id));
    }

    override task(id: string): ExtTaskClient {
        const taskClientContext: ExtTaskClientContext = {
            ...this.context,
            apifyClient: this,
        };
        return new ExtTaskClient(taskClientContext, super.task(id));
    }

    override dataset<T extends DatasetItem>(id: string): ExtDatasetClient<T> {
        return new ExtDatasetClient<T>(this.context, super.dataset(id));
    }

    override run(id: string): RunClient {
        const runName = this.context.runTracker.findRunName(id);
        return runName ? this.extendedRunClient(runName, id) : super.run(id);
    }

    async runByName(runName: string): Promise<ExtRunClient | undefined> {
        // First, check if the Run is currently waiting to start.
        const run = await this.context.runScheduler.findRunStartRequest(runName)?.();
        if (run) return this.extendedRunClient(runName, run.id);

        // Then, check if there is any info about the Run in the tracker.
        const runInfo = this.context.runTracker.findRunByName(runName);
        if (runInfo) return this.extendedRunClient(runName, runInfo.runId);

        // Otherwise, a run with this name does not exist.
        return undefined;
    }

    async actorRunByName(runName: string): Promise<ActorRun | undefined> {
        // First, check if the Run is currently waiting to start.
        const run = await this.context.runScheduler.findRunStartRequest(runName)?.();
        if (run) return run;

        // Then, check if there is any info about the Run in the tracker.
        const runInfo = this.context.runTracker.findRunByName(runName);
        if (runInfo) return this.extendedRunClient(runName, runInfo.runId).get();

        // Otherwise, a run with this name does not exist.
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
                const resultRun = await this.extendedRunClient(runName, run.id).waitForFinish();
                resultRunRecord[runName] = resultRun;
            }),
        );

        return resultRunRecord;
    }

    async abortAllRuns() {
        const currentRuns = this.context.runTracker.getCurrentRuns();
        this.context.logger.info('Aborting Runs', { currentRunNames: Object.keys(currentRuns) });
        await Promise.all(
            Object.entries(currentRuns).map(async ([runName, runInfo]) => {
                const runClient = this.extendedRunClient(runName, runInfo.runId);
                this.context.logger.prefixed(runName).info('Aborting Run', {}, { url: runInfo.runUrl });
                await runClient.abort().catch((error) => {
                    this.context.logger.prefixed(runName).error('Error aborting Run', { error });
                });
            }),
        );
    }

    /**
     * Finds an existing Run by name or starts a new one if none exists or the existing one is not in an OK status.
     *
     * If a Run with the given name is already waiting to start, it will wait for it and return it.
     *
     * @returns a promise resolving to the found or started Run.
     *
     * @internal
     */
    findOrStartRun(runRequest: RunStartRequest): () => Promise<ActorRun> {
        // First, check if the Run is currently waiting to start.
        const startRun = this.context.runScheduler.findRunStartRequest(runRequest.name);
        if (startRun) return startRun;

        // Then, check if we have info about the Run in the tracker, and use it to get the Run object.
        const runInfo = this.context.runTracker.findRunByName(runRequest.name);
        if (runInfo && isRunOkStatus(runInfo.status)) {
            return async () => this.getRunObjectOrStartNew(runRequest, runInfo.runId);
        }

        // Otherwise, we request to start a new Run.
        return this.requestRunStart(runRequest);
    }

    /**
     * @internal
     */
    generateRunRequests<T>(
        namePrefix: string,
        sources: T[],
        inputGenerator: (chunk: T[]) => Dictionary,
        overrideSplitRules: Partial<SplitRules> = {},
        options?: RunStartOptions,
    ): ActorRunRequest[] {
        const splitRules = { ...DEFAULT_SPLIT_RULES, ...overrideSplitRules };
        const inputChunks = generateInputChunks(sources, inputGenerator, splitRules, this.fixedInput);
        return generateRunRequests(namePrefix, inputChunks, options);
    }

    /**
     * @internal
     */
    extendedRunClient(runName: string, id: string): ExtRunClient {
        return new ExtRunClient({ apifyClient: this, ...this.context }, { runName }, super.run(id));
    }

    private requestRunStart(runRequest: RunStartRequest): () => Promise<ActorRun> {
        const mergedInput = mergeDictionaries(this.fixedInput, runRequest.input);
        return this.context.runScheduler.requestRunStart({ ...runRequest, input: mergedInput });
    }

    private async getRunObjectOrStartNew(runRequest: RunStartRequest, existingRunId: string): Promise<ActorRun> {
        const existingRun = await this.extendedRunClient(runRequest.name, existingRunId).get();
        if (existingRun) return existingRun;
        // If the Run was not found, we proceed to start a new one.
        return this.requestRunStart(runRequest)();
    }
}
