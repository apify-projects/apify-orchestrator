import type { ActorRun, TaskCallOptions, TaskLastRunOptions, TaskStartOptions } from 'apify-client';
import { RunClient, TaskClient } from 'apify-client';

import { APIFY_PAYLOAD_BYTES_LIMIT, DEFAULT_SPLIT_RULES, RUN_STATUSES } from '../constants.js';
import { isRunOkStatus } from '../tracker.js';
import type { EnqueueFunction, ExtendedRunClient, ExtendedTaskClient, ExtTaskClientOptions, ForcedEnqueueFunction, RunRecord, RunResult, SplitRules, TaskRunRequest } from '../types.js';
import { splitIntoChunksWithMaxSize, strBytes } from '../utils/bytes.js';
import type { OrchestratorContext } from '../utils/context.js';
import type { ExtRunClientOptions } from './run-client.js';
import { ExtRunClient } from './run-client.js';

function generateInputChunks<T>(
    sources: T[],
    inputGenerator: (chunk: T[]) => object,
    { respectApifyMaxPayloadSize }: SplitRules,
    fixedInputToAddLater?: object,
): object[] {
    if (respectApifyMaxPayloadSize) {
        const maxSize = APIFY_PAYLOAD_BYTES_LIMIT - strBytes(JSON.stringify(fixedInputToAddLater));
        return splitIntoChunksWithMaxSize(sources, inputGenerator, maxSize);
    }

    // Do not split
    return [inputGenerator(sources)];
}

function generateRunRequests(namePrefix: string, inputChunks: object[], options?: TaskStartOptions): TaskRunRequest[] {
    return Object.entries(inputChunks).map(([index, input]) => {
        const runName = inputChunks.length > 1 ? `${namePrefix}-${index}/${inputChunks.length}` : namePrefix;
        return { runName, input, options };
    });
}

export class ExtTaskClient extends TaskClient implements ExtendedTaskClient {
    protected context: OrchestratorContext;

    protected superClient: TaskClient;
    protected enqueueRunOnApifyAccount: EnqueueFunction;
    protected forceEnqueueRunOnApifyAccount: ForcedEnqueueFunction;
    protected fixedInput?: object;

    /**
     * @hidden
     */
    constructor(context: OrchestratorContext, options: ExtTaskClientOptions, taskClient: TaskClient) {
        const { enqueueRunOnApifyAccount, forceEnqueueRunOnApifyAccount, fixedInput } = options;
        super({
            baseUrl: taskClient.baseUrl,
            publicBaseUrl: taskClient.publicBaseUrl,
            apifyClient: taskClient.apifyClient,
            httpClient: taskClient.httpClient,
            id: taskClient.id,
            params: taskClient.params,
        });

        this.context = context;
        this.superClient = taskClient;
        this.enqueueRunOnApifyAccount = enqueueRunOnApifyAccount;
        this.forceEnqueueRunOnApifyAccount = forceEnqueueRunOnApifyAccount;
        this.fixedInput = fixedInput;
    }

    protected generateRunOrchestratorClient(runName: string, runId: string) {
        const runClientOptions: ExtRunClientOptions = { runName };
        const runClient = new RunClient(
            this._subResourceOptions({
                id: runId,
                params: this._params(),
                resourcePath: 'runs',
            }),
        );
        return new ExtRunClient(this.context, runClientOptions, runClient);
    }

    protected generateRunRequests<T>(
        namePrefix: string,
        sources: T[],
        inputGenerator: (chunk: T[]) => object,
        overrideSplitRules: Partial<SplitRules> = {},
        options?: TaskStartOptions,
    ) {
        const splitRules = { ...DEFAULT_SPLIT_RULES, ...overrideSplitRules };
        const inputChunks = generateInputChunks(sources, inputGenerator, splitRules, this.fixedInput);
        return generateRunRequests(namePrefix, inputChunks, options);
    }

    protected async defaultMemoryMbytes() {
        return super.get().then((task) => task?.options?.memoryMbytes);
    }

    protected async enqueueAndWaitForStart(
        runName: string,
        input?: object,
        options?: TaskStartOptions,
    ): Promise<ActorRun> {
        const fullInput: object | undefined =
            !input && !this.fixedInput ? undefined : { ...(input ?? {}), ...(this.fixedInput ?? {}) };

        const runParams = {
            runName,
            startRun: this.superClient.start.bind(this.superClient) as unknown as (
                input?: unknown,
                options?: TaskStartOptions,
            ) => Promise<ActorRun>,
            defaultMemoryMbytes: this.defaultMemoryMbytes.bind(this),
            input: fullInput,
            options,
        };

        let existingRunClient: ExtendedRunClient | undefined;
        let result = await new Promise<RunResult>((resolve) => {
            existingRunClient = this.enqueueRunOnApifyAccount({
                ...runParams,
                startCallbacks: [resolve],
            });
            if (existingRunClient) {
                resolve({ kind: RUN_STATUSES.IN_PROGRESS });
            }
        });

        if (result.kind === RUN_STATUSES.IN_PROGRESS && existingRunClient) {
            const run = await existingRunClient.get();

            // If it was not possible to retrieve the Run from the client, force enqueuing a new Run.
            if (run) {
                result = { kind: RUN_STATUSES.RUN_STARTED, run };
            } else {
                result = await new Promise<RunResult>((resolve) => {
                    existingRunClient = this.forceEnqueueRunOnApifyAccount({
                        ...runParams,
                        startCallbacks: [resolve],
                    });
                    if (existingRunClient) {
                        resolve({ kind: RUN_STATUSES.IN_PROGRESS });
                    }
                });
            }
        }

        if (result.kind === RUN_STATUSES.ERROR) {
            throw result.error;
        }

        if (result.kind === RUN_STATUSES.IN_PROGRESS) {
            throw new Error(`Error starting Run: ${runName} (${this.id}).`);
        }

        return result.run;
    }

    override async start(runName: string, input?: object, options: TaskStartOptions = {}): Promise<ActorRun> {
        const existingRunInfo = this.context.runsTracker.findRunByName(runName);

        // If the Run exists and has not failed, use it
        if (existingRunInfo && isRunOkStatus(existingRunInfo.status)) {
            const runClient = this.generateRunOrchestratorClient(runName, existingRunInfo.runId);
            const run = await runClient.get();
            // Return the existing Run, if available, otherwise start a new one
            if (run) {
                return run;
            }
        }

        return this.enqueueAndWaitForStart(runName, input, options);
    }

    override async call(runName: string, input?: object, options: TaskCallOptions = {}): Promise<ActorRun> {
        const startedRun = await this.start(runName, input, options);
        const { waitSecs } = options;
        return this.generateRunOrchestratorClient(runName, startedRun.id).waitForFinish({ waitSecs });
    }

    override lastRun(options?: TaskLastRunOptions): RunClient {
        const runClient = super.lastRun(options);
        if (runClient.id) {
            const runName = this.context.runsTracker.findRunName(runClient.id);
            if (runName) {
                return this.generateRunOrchestratorClient(runName, runClient.id);
            }
        }
        return runClient;
    }

    enqueue(...runRequests: TaskRunRequest[]) {
        for (const { runName, input, options } of runRequests) {
            this.enqueueRunOnApifyAccount({
                runName,
                startRun: this.superClient.start.bind(this.superClient) as unknown as (
                    input?: unknown,
                    options?: TaskStartOptions
                ) => Promise<ActorRun>,
                startCallbacks: [],
                input,
                options,
                defaultMemoryMbytes: this.defaultMemoryMbytes.bind(this),
            });
        }
        return runRequests.map(({ runName }) => runName);
    }

    enqueueBatch<T>(
        namePrefix: string,
        sources: T[],
        inputGenerator: (chunk: T[]) => object,
        overrideSplitRules: Partial<SplitRules> = {},
        options?: TaskStartOptions,
    ) {
        return this.enqueue(
            ...this.generateRunRequests(namePrefix, sources, inputGenerator, overrideSplitRules, options),
        );
    }

    async startRuns(...runRequests: TaskRunRequest[]): Promise<RunRecord> {
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
        inputGenerator: (chunk: T[]) => object,
        overrideSplitRules: Partial<SplitRules> = {},
        options?: TaskStartOptions,
    ): Promise<RunRecord> {
        return this.startRuns(
            ...this.generateRunRequests(namePrefix, sources, inputGenerator, overrideSplitRules, options),
        );
    }

    async callRuns(...runRequests: TaskRunRequest[]): Promise<RunRecord> {
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
        inputGenerator: (chunk: T[]) => object,
        overrideSplitRules: Partial<SplitRules> = {},
        options?: TaskStartOptions,
    ): Promise<RunRecord> {
        return this.callRuns(
            ...this.generateRunRequests(namePrefix, sources, inputGenerator, overrideSplitRules, options),
        );
    }
}
