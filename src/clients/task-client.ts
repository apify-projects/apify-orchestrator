import type {
    ActorRun,
    Dictionary,
    RunClient,
    TaskCallOptions,
    TaskLastRunOptions,
    TaskStartOptions,
} from 'apify-client';
import { TaskClient } from 'apify-client';

import type { ClientContext } from '../context/client-context.js';
import { RunSource } from '../entities/run-source.js';
import type { ExtendedTaskClient, RunRecord, SplitRules, TaskRunRequest } from '../types.js';
import { hashObject } from '../utils/hash.js';
import { isDefined } from '../utils/typing.js';
import type { ExtApifyClient } from './apify-client.js';
import type { ExtRunClient } from './run-client.js';

export class ExtTaskClient extends TaskClient implements ExtendedTaskClient {
    private readonly runSource = new RunSource(super.start.bind(this), this.defaultMemoryMbytes.bind(this));
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
        const runNames = new Set<string>();
        for (const runRequest of runRequests) {
            const requestId = runRequest.runName ?? this.generateRequestHash(runRequest.input, runRequest.options);
            if (runNames.has(requestId)) {
                this.context.logger.prefixed(requestId).warning('Skipping enqueuing duplicate run name.');
                continue;
            }
            runNames.add(requestId);
            this.apifyClient.findOrRequestRunStart({
                source: this.runSource,
                requestId,
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

    override async start(input?: Dictionary, options: TaskStartOptions & { runName?: string } = {}): Promise<ActorRun> {
        const { runName, ...runOptions } = options;
        const requestId = runName ?? this.generateRequestHash(input, options);

        return this.apifyClient.findOrStartRun({
            source: this.runSource,
            requestId,
            input,
            options: Object.keys(runOptions).length === 0 ? undefined : runOptions,
        });
    }

    override async call(input?: Dictionary, options: TaskCallOptions & { runName?: string } = {}): Promise<ActorRun> {
        const { runName } = options;
        const requestId = runName ?? this.generateRequestHash(input, options);
        const startedRun = await this.start(input, options);
        const { waitSecs } = options;
        return this.apifyClient.extendedRunClient(requestId, startedRun.id).waitForFinish({ waitSecs });
    }

    override lastRun(options?: TaskLastRunOptions): RunClient | ExtRunClient {
        const runClient = super.lastRun(options);
        return isDefined(runClient.id) ? this.apifyClient.run(runClient.id) : runClient;
    }

    async startRuns(...runRequests: TaskRunRequest[]): Promise<RunRecord> {
        const runRecord: RunRecord = {};
        await Promise.all(
            runRequests.map(async ({ runName, input, options }) => {
                const requestId = runName ?? this.generateRequestHash(input, options);
                await this.start(input, { ...(options ?? {}), runName: requestId }).then((run) => {
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
        options?: TaskStartOptions,
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

    async callRuns(...runRequests: TaskRunRequest[]): Promise<RunRecord> {
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
        options?: TaskStartOptions,
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
        return hashObject({ taskId: this.id, input, options });
    }

    private async defaultMemoryMbytes(): Promise<number | undefined> {
        const task = await this.get();
        return task?.options?.memoryMbytes;
    }
}
