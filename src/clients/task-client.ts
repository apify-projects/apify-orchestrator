import type { Dictionary, RunClient, TaskLastRunOptions, TaskStartOptions } from 'apify-client';
import { TaskClient } from 'apify-client';

import type { ClientContext } from '../context/client-context.js';
import { RunSource } from '../entities/run-source.js';
import type {
    ExtendedActorRun,
    ExtendedTaskCallOptions,
    ExtendedTaskClient,
    ExtendedTaskStartOptions,
    SplitRules,
    TaskRunRequest,
} from '../types.js';
import { isDefined } from '../utils/typing.js';
import type { ExtApifyClient } from './apify-client.js';
import type { ExtRunClient } from './run-client.js';

export class ExtTaskClient extends TaskClient implements ExtendedTaskClient {
    private readonly runSource = new RunSource({
        type: 'task',
        id: this.id,
        start: super.start.bind(this),
        defaultMemoryMbytes: this.defaultMemoryMbytes.bind(this),
    });

    private readonly context: ClientContext;
    override apifyClient: ExtApifyClient;

    constructor(context: ClientContext, apifyClient: ExtApifyClient, taskClient: TaskClient) {
        super({
            baseUrl: taskClient.baseUrl,
            publicBaseUrl: taskClient.publicBaseUrl,
            apifyClient,
            httpClient: taskClient.httpClient,
            id: taskClient.id,
            params: taskClient.params,
        });
        this.context = context;
        this.apifyClient = apifyClient;
    }

    enqueue(...runRequests: TaskRunRequest[]): string[] {
        const requestIds = new Set<string>();
        for (const runRequest of runRequests) {
            const requestId = this.runSource.getRequestId(runRequest.input, runRequest.options, runRequest.runName);
            if (requestIds.has(requestId)) {
                this.context.logger.prefixed(requestId).warning('Skipping enqueuing duplicate run name.');
                continue;
            }
            requestIds.add(requestId);
            this.apifyClient.findOrRequestRunStart({
                source: this.runSource,
                runName: requestId,
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
        options?: TaskStartOptions,
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

    override async start(input?: Dictionary, options: ExtendedTaskStartOptions = {}): Promise<ExtendedActorRun> {
        const { runName, ...runOptions } = options;
        return this.apifyClient.findOrStartRun({
            source: this.runSource,
            runName,
            input,
            options: Object.keys(runOptions).length === 0 ? undefined : runOptions,
        });
    }

    override async call(input?: Dictionary, options?: ExtendedTaskCallOptions): Promise<ExtendedActorRun> {
        const startedRun = await this.start(input, options);
        const { waitSecs } = options ?? {};
        return this.apifyClient.extendedRunClient(startedRun.requestId, startedRun.id).waitForFinish({ waitSecs });
    }

    override lastRun(options?: TaskLastRunOptions): RunClient | ExtRunClient {
        const runClient = super.lastRun(options);
        return isDefined(runClient.id) ? this.apifyClient.run(runClient.id) : runClient;
    }

    async startRuns(...runRequests: TaskRunRequest[]): Promise<ExtendedActorRun[]> {
        return Promise.all(
            runRequests.map(async ({ runName, input, options }) => this.start(input, { ...options, runName })),
        );
    }

    async startBatch<T>(
        namePrefix: string,
        sources: T[],
        inputGenerator: (chunk: T[]) => Dictionary,
        overrideSplitRules?: Partial<SplitRules>,
        options?: TaskStartOptions,
    ): Promise<ExtendedActorRun[]> {
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

    async callRuns(...runRequests: TaskRunRequest[]): Promise<ExtendedActorRun[]> {
        return Promise.all(
            runRequests.map(async ({ runName, input, options }) => this.call(input, { ...options, runName })),
        );
    }

    async callBatch<T>(
        namePrefix: string,
        sources: T[],
        inputGenerator: (chunk: T[]) => Dictionary,
        overrideSplitRules?: Partial<SplitRules>,
        options?: TaskStartOptions,
    ): Promise<ExtendedActorRun[]> {
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

    private async defaultMemoryMbytes(): Promise<number | undefined> {
        const task = await this.get();
        return task?.options?.memoryMbytes;
    }
}
