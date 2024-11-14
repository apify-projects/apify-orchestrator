import { ActorCallOptions, ActorClient, ActorLastRunOptions, ActorRun, ActorStartOptions, RunClient } from 'apify-client';

import { ExtRunClient } from './run-client.js';
import { APIFY_PAYLOAD_BYTES_LIMIT } from '../constants.js';
import { RunsTracker, isRunOkStatus } from '../tracker.js';
import { ActorRunRequest, ExtendedActorClient, RunRecord, SplitRules, ExtendedRunClient } from '../types.js';
import { splitIntoChunksWithMaxSize, strBytes } from '../utils/bytes.js';
import { CustomLogger } from '../utils/logging.js';

export interface EnqueuedRequest {
    runName: string
    defaultMemoryMbytes: () => Promise<number | undefined>
    startRun: (input?: unknown, options?: ActorStartOptions) => Promise<ActorRun>
    startCallbacks: ((run: ActorRun | undefined) => void)[]
    input?: object
    options?: ActorStartOptions
}

type EnqueueFunction = (runRequest: EnqueuedRequest) => ExtendedRunClient | undefined
type ForcedEnqueueFunction = (runRequest: EnqueuedRequest) => undefined

function mergeInputParams(input?: object, extraParams?: object): object | undefined {
    return (input && extraParams) ? { ...input, ...extraParams } : input;
}

const DEFAULT_SPLIT_RULES: SplitRules = {
    respectApifyMaxPayloadSize: true,
};

function generateInputChunks<T>(
    sources: T[],
    inputGenerator: (chunk: T[]) => object,
    {
        respectApifyMaxPayloadSize,
    }: SplitRules,
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
        const runName = inputChunks.length > 1
            ? `${namePrefix}-${index}/${inputChunks.length}`
            : namePrefix;
        return { runName, input, options };
    });
}

export class ExtActorClient extends ActorClient implements ExtendedActorClient {
    protected superClient: ActorClient;
    protected enqueueFunction: EnqueueFunction;
    protected forcedEnqueueFunction: ForcedEnqueueFunction;
    protected customLogger: CustomLogger;
    protected runsTracker: RunsTracker;
    protected fixedInput?: object;

    /**
     * @hidden
     */
    constructor(
        actorClient: ActorClient,
        customLogger: CustomLogger,
        runsTracker: RunsTracker,
        enqueueFunction: EnqueueFunction,
        forcedEnqueueFunction: ForcedEnqueueFunction,
        fixedInput?: object,
    ) {
        super({
            baseUrl: actorClient.baseUrl,
            apifyClient: actorClient.apifyClient,
            httpClient: actorClient.httpClient,
            id: actorClient.id,
            params: actorClient.params,
        });
        this.superClient = actorClient;
        this.customLogger = customLogger;
        this.runsTracker = runsTracker;
        this.enqueueFunction = enqueueFunction;
        this.forcedEnqueueFunction = forcedEnqueueFunction;
        this.fixedInput = fixedInput;
    }

    protected generateRunOrchestratorClient(runName: string, runId: string) {
        const runClient = new RunClient(this._subResourceOptions({
            id: runId,
            params: this._params(),
            resourcePath: 'runs',
        }));
        return new ExtRunClient(
            runClient,
            runName,
            this.customLogger,
            this.runsTracker,
        );
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

    protected async enqueueAndWaitForStart(runName: string, input?: object, options?: ActorStartOptions): Promise<ActorRun> {
        const runParams = {
            runName,
            defaultMemoryMbytes: this.defaultMemoryMbytes.bind(this),
            startRun: this.superClient.start.bind(this.superClient),
            input,
            options,
        };

        let existingRunClient: ExtendedRunClient | undefined;
        let run = await new Promise<ActorRun | undefined>((resolve) => {
            existingRunClient = this.enqueueFunction({
                ...runParams,
                startCallbacks: [resolve],
            });
            if (existingRunClient) { resolve(undefined); }
        });

        if (!run && existingRunClient) {
            run = await existingRunClient.get();

            // If it was not possible to retrieve the Run from the client, force enqueuing a new Run.
            if (!run) {
                run = await new Promise<ActorRun | undefined>((resolve) => {
                    existingRunClient = this.forcedEnqueueFunction({
                        ...runParams,
                        startCallbacks: [resolve],
                    });
                    if (existingRunClient) { resolve(undefined); }
                });
            }
        }

        if (!run) {
            throw new Error(`Error starting Run: ${runName} (${this.id}).`);
        }

        return run;
    }

    override async start(runName: string, input?: object, options?: ActorStartOptions): Promise<ActorRun> {
        const existingRunInfo = this.runsTracker.findRunByName(runName);

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
            const runName = this.runsTracker.findRunName(runClient.id);
            if (runName) {
                return this.generateRunOrchestratorClient(runName, runClient.id);
            }
        }
        return runClient;
    }

    enqueue(...runRequests: ActorRunRequest[]) {
        for (const { runName, input, options } of runRequests) {
            this.enqueueFunction({
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
        await Promise.all(runRequests.map(
            async ({ runName, input, options }) => this.start(runName, mergeInputParams(input, this.fixedInput), options)
                .then((run) => { runRecord[runName] = run; }),
        ));
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
        await Promise.all(runRequests.map(
            async ({ runName, input, options }) => this.call(runName, mergeInputParams(input, this.fixedInput), options)
                .then((run) => { runRecord[runName] = run; }),
        ));
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
