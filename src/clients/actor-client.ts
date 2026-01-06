import type {
    ActorCallOptions,
    ActorLastRunOptions,
    ActorRun,
    ActorStartOptions,
    Dictionary,
    RunClient,
} from 'apify-client';
import { ActorClient } from 'apify-client';

import { RunSource } from '../entities/run-source.js';
import type { ActorRunRequest, ExtendedActorClient, RunRecord, SplitRules } from '../types.js';
import type { OrchestratorContext } from '../utils/context.js';
import type { ExtApifyClient } from './apify-client.js';

export interface ExtActorClientContext extends OrchestratorContext {
    apifyClient: ExtApifyClient;
}

export class ExtActorClient extends ActorClient implements ExtendedActorClient {
    private readonly runSource = new RunSource(super.start.bind(this), this.defaultMemoryMbytes.bind(this));

    /**
     * @internal
     */
    constructor(
        private readonly context: ExtActorClientContext,
        actorClient: ActorClient,
    ) {
        super({
            baseUrl: actorClient.baseUrl,
            publicBaseUrl: actorClient.publicBaseUrl,
            apifyClient: actorClient.apifyClient,
            httpClient: actorClient.httpClient,
            id: actorClient.id,
            params: actorClient.params,
        });
    }

    enqueue(...runRequests: ActorRunRequest[]): string[] {
        const runNames = new Set<string>();
        for (const runRequest of runRequests) {
            if (runNames.has(runRequest.runName)) {
                this.context.logger.prefixed(runRequest.runName).warning('Skipping enqueuing duplicate run name.');
                continue;
            }
            runNames.add(runRequest.runName);
            this.context.apifyClient.findOrStartRun({
                source: this.runSource,
                name: runRequest.runName,
                input: runRequest.input,
                options: runRequest.options,
            });
        }
        return Array.from(runNames);
    }

    enqueueBatch<T>(
        namePrefix: string,
        sources: T[],
        inputGenerator: (chunk: T[]) => Dictionary,
        overrideSplitRules?: Partial<SplitRules>,
        options?: ActorStartOptions,
    ): string[] {
        return this.enqueue(
            ...this.context.apifyClient.generateRunRequests(
                namePrefix,
                sources,
                inputGenerator,
                overrideSplitRules,
                options,
            ),
        );
    }

    /**
     * FIXME: change the `input` parameter type from `object` to `Dictionary` after the `apify-client-js` issue is resolved:
     * https://github.com/apify/apify-client-js/issues/818.
     *
     * FIXME: move `runName` to options, like in `ExtendedTaskClient.start`.
     *
     * Note: this method should be consistent with the `apify-client-js`'s `ActorClient.start` method.
     */
    override async start(runName: string, input?: object, options?: ActorStartOptions): Promise<ActorRun> {
        const waitForRun = this.context.apifyClient.findOrStartRun({
            source: this.runSource,
            name: runName,
            input: input as Dictionary,
            options,
        });
        return waitForRun();
    }

    /**
     * FIXME: change the `input` parameter type from `object` to `Dictionary` after the `apify-client-js` issue is resolved:
     * https://github.com/apify/apify-client-js/issues/818.
     *
     * FIXME: move `runName` to options, like in `ExtendedTaskClient.call`.
     *
     * Note: this method should be consistent with the `apify-client-js`'s `ActorClient.call` method.
     */
    override async call(runName: string, input?: object, options?: ActorCallOptions): Promise<ActorRun> {
        const startedRun = await this.start(runName, input, options);
        return this.context.apifyClient
            .extendedRunClient(runName, startedRun.id)
            .waitForFinish({ waitSecs: options?.waitSecs });
    }

    override lastRun(options?: ActorLastRunOptions): RunClient {
        const runClient = super.lastRun(options);
        return runClient.id ? this.context.apifyClient.run(runClient.id) : runClient;
    }

    async startRuns(...runRequests: ActorRunRequest[]): Promise<RunRecord> {
        const runRecord: RunRecord = {};
        await Promise.all(
            runRequests.map(async ({ runName, input, options }) =>
                this.start(runName, input, options).then((run) => {
                    runRecord[runName] = run;
                }),
            ),
        );
        return runRecord;
    }

    async startBatch<T>(
        namePrefix: string,
        sources: T[],
        inputGenerator: (chunk: T[]) => Dictionary,
        overrideSplitRules?: Partial<SplitRules>,
        options?: ActorStartOptions,
    ): Promise<RunRecord> {
        return this.startRuns(
            ...this.context.apifyClient.generateRunRequests(
                namePrefix,
                sources,
                inputGenerator,
                overrideSplitRules,
                options,
            ),
        );
    }

    async callRuns(...runRequests: ActorRunRequest[]): Promise<RunRecord> {
        const runRecord: RunRecord = {};
        await Promise.all(
            runRequests.map(async ({ runName, input, options }) =>
                this.call(runName, input, options).then((run) => {
                    runRecord[runName] = run;
                }),
            ),
        );
        return runRecord;
    }

    async callBatch<T>(
        namePrefix: string,
        sources: T[],
        inputGenerator: (chunk: T[]) => Dictionary,
        overrideSplitRules?: Partial<SplitRules>,
        options?: ActorStartOptions,
    ): Promise<RunRecord> {
        return this.callRuns(
            ...this.context.apifyClient.generateRunRequests(
                namePrefix,
                sources,
                inputGenerator,
                overrideSplitRules,
                options,
            ),
        );
    }

    private async defaultMemoryMbytes(): Promise<number | undefined> {
        const actor = await this.get();
        return actor?.defaultRunOptions.memoryMbytes;
    }
}
