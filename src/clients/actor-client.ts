import type {
    ActorCallOptions,
    ActorLastRunOptions,
    ActorRun,
    ActorStartOptions,
    Dictionary,
    RunClient,
} from 'apify-client';
import { ActorClient } from 'apify-client';

import type { ClientContext } from '../context/client-context.js';
import { RunSource } from '../entities/run-source.js';
import type { ActorRunRequest, ExtendedActorClient, RunRecord, SplitRules } from '../types.js';
import { hashObject } from '../utils/hash.js';
import { isDefined } from '../utils/typing.js';
import type { ExtApifyClient } from './apify-client.js';
import type { ExtRunClient } from './run-client.js';

export class ExtActorClient extends ActorClient implements ExtendedActorClient {
    private readonly runSource = new RunSource(super.start.bind(this), this.defaultMemoryMbytes.bind(this));
    private readonly context: ClientContext;
    override apifyClient: ExtApifyClient;

    /**
     * @internal
     */
    constructor(context: ClientContext, apifyClient: ExtApifyClient, actorClient: ActorClient) {
        super({
            baseUrl: actorClient.baseUrl,
            publicBaseUrl: actorClient.publicBaseUrl,
            apifyClient,
            httpClient: actorClient.httpClient,
            id: actorClient.id,
            params: actorClient.params,
        });
        this.context = context;
        this.apifyClient = apifyClient;
    }

    enqueue(...runRequests: ActorRunRequest[]): string[] {
        const requestIds = new Set<string>();
        for (const runRequest of runRequests) {
            const requestId = runRequest.runName ?? this.generateRequestHash(runRequest.input, runRequest.options);
            if (requestIds.has(requestId)) {
                this.context.logger
                    .prefixed(requestId)
                    .warning('Skipping enqueuing identical Run requests, or requests with the same name.');
                continue;
            }
            requestIds.add(requestId);
            this.apifyClient.findOrRequestRunStart({
                source: this.runSource,
                requestId,
                input: runRequest.input,
                options: runRequest.options,
            });
        }
        return Array.from(requestIds);
    }

    enqueueBatch<T>(
        namePrefix: string,
        sources: T[],
        inputGenerator: (chunk: T[]) => Dictionary,
        overrideSplitRules?: Partial<SplitRules>,
        options?: ActorStartOptions,
    ): string[] {
        return this.enqueue(
            ...this.context.generateRunRequests({
                namePrefix,
                sources,
                inputGenerator,
                overrideSplitRules,
                options,
            }),
        );
    }

    /**
     * FIXME: change the `input` parameter type from `object` to `Dictionary` after the `apify-client-js` issue is resolved:
     * https://github.com/apify/apify-client-js/issues/818.
     */
    override async start(input?: object, options?: ActorStartOptions & { runName?: string }): Promise<ActorRun> {
        const { runName, ...startOptions } = options ?? {};
        const requestId = runName ?? this.generateRequestHash(input, options);
        return this.apifyClient.findOrStartRun({
            source: this.runSource,
            requestId,
            input: input as Dictionary,
            options: Object.keys(startOptions).length === 0 ? undefined : startOptions,
        });
    }

    /**
     * FIXME: change the `input` parameter type from `object` to `Dictionary` after the `apify-client-js` issue is resolved:
     * https://github.com/apify/apify-client-js/issues/818.
     */
    override async call(input?: object, options?: ActorCallOptions & { runName?: string }): Promise<ActorRun> {
        const requestId = options?.runName ?? this.generateRequestHash(input, options);
        const startedRun = await this.start(input, options);
        return this.apifyClient
            .extendedRunClient(requestId, startedRun.id)
            .waitForFinish({ waitSecs: options?.waitSecs });
    }

    override lastRun(options?: ActorLastRunOptions): RunClient | ExtRunClient {
        const runClient = super.lastRun(options);
        return isDefined(runClient.id) ? this.apifyClient.run(runClient.id) : runClient;
    }

    async startRuns(...runRequests: ActorRunRequest[]): Promise<RunRecord> {
        const runRecord: RunRecord = {};
        await Promise.all(
            runRequests.map(async ({ runName, input, options }) => {
                const requestId = runName ?? this.generateRequestHash(input, options);
                await this.start(input, { ...options, runName: requestId }).then((run) => {
                    runRecord[requestId] = run;
                });
            }),
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
            ...this.context.generateRunRequests({
                namePrefix,
                sources,
                inputGenerator,
                overrideSplitRules,
                options,
            }),
        );
    }

    async callRuns(...runRequests: ActorRunRequest[]): Promise<RunRecord> {
        const runRecord: RunRecord = {};
        await Promise.all(
            runRequests.map(async ({ runName, input, options }) => {
                const requestId = runName ?? this.generateRequestHash(input, options);
                await this.call(input, { ...options, runName: requestId }).then((run) => {
                    runRecord[requestId] = run;
                });
            }),
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
            ...this.context.generateRunRequests({
                namePrefix,
                sources,
                inputGenerator,
                overrideSplitRules,
                options,
            }),
        );
    }

    private generateRequestHash(input: unknown, options: unknown): string {
        return hashObject({ actorId: this.id, input, options });
    }

    private async defaultMemoryMbytes(): Promise<number | undefined> {
        const actor = await this.get();
        return actor?.defaultRunOptions.memoryMbytes;
    }
}
