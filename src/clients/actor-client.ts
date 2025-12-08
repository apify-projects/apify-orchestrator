import type { ActorCallOptions, ActorLastRunOptions, ActorRun, ActorStartOptions } from 'apify-client';
import { ActorClient, RunClient } from 'apify-client';
import { isRunOkStatus } from 'src/utils/apify-client.js';

import { APIFY_PAYLOAD_BYTES_LIMIT } from '../constants.js';
import type { ActorRunRequest, ExtendedActorClient, ExtendedRunClient, RunRecord, SplitRules } from '../types.js';
import { splitIntoChunksWithMaxSize, strBytes } from '../utils/bytes.js';
import type { OrchestratorContext } from '../utils/context.js';
import type { ExtRunClientOptions } from './run-client.js';
import { ExtRunClient } from './run-client.js';

export const RUN_STATUSES = {
    RUN_STARTED: 'RUN_STARTED',
    ERROR: 'ERROR',
    /**
     * Returned when a run is about to be spawned on the platform
     */
    IN_PROGRESS: 'IN_PROGRESS',
} as const;

export type RunResult =
    | {
          kind: typeof RUN_STATUSES.RUN_STARTED;
          run: ActorRun;
      }
    | {
          kind: typeof RUN_STATUSES.ERROR;
          error: Error;
      }
    | {
          // returned when a run is about to be spawned on the platform
          kind: typeof RUN_STATUSES.IN_PROGRESS;
      };

export interface EnqueuedRequest {
    runName: string;
    defaultMemoryMbytes: () => Promise<number | undefined>;
    startRun: (input?: unknown, options?: ActorStartOptions) => Promise<ActorRun>;
    startCallbacks: ((result: RunResult) => void)[];
    input?: object;
    options?: ActorStartOptions;
}

type EnqueueFunction = (runRequest: EnqueuedRequest) => ExtendedRunClient | undefined;
type ForcedEnqueueFunction = (runRequest: EnqueuedRequest) => undefined;

export interface ExtActorClientOptions {
    enqueueRunOnApifyAccount: EnqueueFunction;
    forceEnqueueRunOnApifyAccount: ForcedEnqueueFunction;
    fixedInput?: object;
}

const DEFAULT_SPLIT_RULES: SplitRules = {
    respectApifyMaxPayloadSize: true,
};

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

function generateRunRequests(
    namePrefix: string,
    inputChunks: object[],
    options?: ActorStartOptions,
): ActorRunRequest[] {
    return Object.entries(inputChunks).map(([index, input]) => {
        const runName = inputChunks.length > 1 ? `${namePrefix}-${index}/${inputChunks.length}` : namePrefix;
        return { runName, input, options };
    });
}

export class ExtActorClient extends ActorClient implements ExtendedActorClient {
    protected context: OrchestratorContext;

    protected superClient: ActorClient;
    protected enqueueRunOnApifyAccount: EnqueueFunction;
    protected forceEnqueueRunOnApifyAccount: ForcedEnqueueFunction;
    protected fixedInput?: object;

    /**
     * @hidden
     */
    constructor(context: OrchestratorContext, options: ExtActorClientOptions, actorClient: ActorClient) {
        const { enqueueRunOnApifyAccount, forceEnqueueRunOnApifyAccount, fixedInput } = options;
        super({
            baseUrl: actorClient.baseUrl,
            publicBaseUrl: actorClient.publicBaseUrl,
            apifyClient: actorClient.apifyClient,
            httpClient: actorClient.httpClient,
            id: actorClient.id,
            params: actorClient.params,
        });
        this.context = context;
        this.superClient = actorClient;
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
        options?: ActorStartOptions,
    ) {
        const splitRules = { ...DEFAULT_SPLIT_RULES, ...overrideSplitRules };
        const inputChunks = generateInputChunks(sources, inputGenerator, splitRules, this.fixedInput);
        return generateRunRequests(namePrefix, inputChunks, options);
    }

    protected async defaultMemoryMbytes() {
        return (await this.get())?.defaultRunOptions.memoryMbytes;
    }

    protected async enqueueAndWaitForStart(
        runName: string,
        input?: object,
        options?: ActorStartOptions,
    ): Promise<ActorRun> {
        const fullInput: object | undefined =
            !input && !this.fixedInput ? undefined : { ...(input ?? {}), ...(this.fixedInput ?? {}) };

        const runParams = {
            runName,
            defaultMemoryMbytes: this.defaultMemoryMbytes.bind(this),
            startRun: this.superClient.start.bind(this.superClient),
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

    override async start(runName: string, input?: object, options?: ActorStartOptions): Promise<ActorRun> {
        const existingRunInfo = this.context.runTracker.findRunByName(runName);

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

    override async call(runName: string, input?: object, options: ActorCallOptions = {}): Promise<ActorRun> {
        const startedRun = await this.start(runName, input, options);
        const { waitSecs } = options;
        return this.generateRunOrchestratorClient(runName, startedRun.id).waitForFinish({ waitSecs });
    }

    override lastRun(options?: ActorLastRunOptions): RunClient {
        const runClient = this.superClient.lastRun(options);
        if (runClient.id) {
            const runName = this.context.runTracker.findRunName(runClient.id);
            if (runName) {
                return this.generateRunOrchestratorClient(runName, runClient.id);
            }
        }
        return runClient;
    }

    enqueue(...runRequests: ActorRunRequest[]) {
        for (const { runName, input, options } of runRequests) {
            this.enqueueRunOnApifyAccount({
                runName,
                defaultMemoryMbytes: this.defaultMemoryMbytes.bind(this),
                startRun: this.superClient.start.bind(this.superClient),
                startCallbacks: [],
                input,
                options,
            });
        }
        return runRequests.map(({ runName }) => runName);
    }

    enqueueBatch<T>(
        namePrefix: string,
        sources: T[],
        inputGenerator: (chunk: T[]) => object,
        overrideSplitRules: Partial<SplitRules> = {},
        options?: ActorStartOptions,
    ) {
        return this.enqueue(
            ...this.generateRunRequests(namePrefix, sources, inputGenerator, overrideSplitRules, options),
        );
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
        inputGenerator: (chunk: T[]) => object,
        overrideSplitRules: Partial<SplitRules> = {},
        options?: ActorStartOptions,
    ): Promise<RunRecord> {
        return this.startRuns(
            ...this.generateRunRequests(namePrefix, sources, inputGenerator, overrideSplitRules, options),
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
        inputGenerator: (chunk: T[]) => object,
        overrideSplitRules: Partial<SplitRules> = {},
        options?: ActorStartOptions,
    ): Promise<RunRecord> {
        return this.callRuns(
            ...this.generateRunRequests(namePrefix, sources, inputGenerator, overrideSplitRules, options),
        );
    }
}
