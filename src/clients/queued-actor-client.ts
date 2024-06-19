import { ActorCallOptions, ActorClient, ActorLastRunOptions, ActorRun, ActorStartOptions, RunClient } from 'apify-client';

import { TrackingRunClient } from './tracking-run-client.js';
import { APIFY_PAYLOAD_BYTES_LIMIT } from '../constants.js';
import { RunsTracker, isRunFailStatus, isRunOkStatus } from '../tracker.js';
import { RunRecord, SplitRules } from '../types.js';
import { splitIntoChunksWithMaxSize, strBytes } from '../utils/bytes.js';
import { CustomLogger } from '../utils/logging.js';

interface ActorRunRequest {
    runName: string
    input?: object
    options?: ActorStartOptions
}

export interface EnqueuedRequest {
    runName: string
    memoryMbytes: number
    readyCallback: (isReady: boolean) => void
}

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

export class QueuedActorClient extends ActorClient {
    protected superClient: ActorClient;
    protected enqueue: (runRequest: EnqueuedRequest) => void;
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
        enqueue: (runRequest: EnqueuedRequest) => void,
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
        this.enqueue = enqueue;
        this.fixedInput = fixedInput;
    }

    protected generateRunOrchestratorClient(runName: string, runId: string, options?: ActorLastRunOptions) {
        const runClient = new RunClient(this._subResourceOptions({
            id: runId,
            params: this._params(options),
            resourcePath: 'runs',
        }));
        return new TrackingRunClient(
            runClient,
            runName,
            this.customLogger,
            this.runsTracker,
        );
    }

    protected async awaitClientToBeReady(runName: string, requestMbytes?: number) {
        // Compute necessary memory for this Run
        const memoryMbytes = requestMbytes
        ?? (await this.get())?.defaultRunOptions.memoryMbytes
        // If the user didn't provide a memory option and the default options cannot be read, set the requirement to zero
        ?? 0;

        const isReady = await new Promise<boolean>((resolve) => {
            this.enqueue({ runName, memoryMbytes, readyCallback: resolve });
        });

        if (!isReady) {
            throw new Error(`Client not ready to run: ${runName} (${this.id}). Maybe the orchestrator was stopped?`);
        }
    }

    override async start(runName: string, input?: object, options?: ActorStartOptions): Promise<ActorRun> {
        const existingRunInfo = this.runsTracker.currentRuns[runName];

        // If the Run exists and has not failed, use it
        if (existingRunInfo && isRunOkStatus(existingRunInfo.status)) {
            this.customLogger.prfxInfo(
                runName,
                'Found existing Run: checking it',
                { runId: existingRunInfo.runId },
            );
            const runClient = this.generateRunOrchestratorClient(runName, existingRunInfo.runId);
            const run = await runClient.get();
            // Return the existing Run, if available, otherwise start a new one
            if (run) {
                return run;
            }
            this.customLogger.prfxInfo(
                runName,
                'Cannot retrieve existing Run: starting a new one',
                { runId: existingRunInfo.runId },
            );
        }

        await this.awaitClientToBeReady(runName, options?.memory);
        const run = await this.superClient.start(mergeInputParams(input, this.fixedInput), options);
        const runInfo = await this.runsTracker.updateRun(runName, run);
        this.customLogger.prfxInfo(runName, `Started Run`, { url: runInfo.runUrl });
        return run;
    }

    override async call(runName: string, input?: object, options?: ActorCallOptions): Promise<ActorRun> {
        const existingRunInfo = this.runsTracker.currentRuns[runName];

        // If the Run exists and has not failed, use it
        if (existingRunInfo && isRunOkStatus(existingRunInfo.status)) {
            this.customLogger.prfxInfo(
                runName,
                'Found existing Run: not starting a new one',
                { runId: existingRunInfo.runId },
            );
            const runClient = this.generateRunOrchestratorClient(runName, existingRunInfo.runId);
            return runClient.waitForFinish(); // Wait for the existing Run to finish
        }

        await this.awaitClientToBeReady(runName, options?.memory);
        const run = await this.superClient.call(mergeInputParams(input, this.fixedInput), options);
        const runInfo = await this.runsTracker.updateRun(runName, run);
        if (isRunFailStatus(run.status)) {
            this.customLogger.prfxWarn(runName, 'Run failed', { status: run.status, url: runInfo.runUrl });
        } else {
            this.customLogger.prfxInfo(runName, `Run finished`, { status: run.status, url: runInfo.runUrl });
        }
        return run;
    }

    override lastRun(options?: ActorLastRunOptions): RunClient {
        const runClient = this.superClient.lastRun(options);
        if (runClient.id) {
            const runName = this.runsTracker.findRunName(runClient.id);
            if (runName) {
                return this.generateRunOrchestratorClient(runName, runClient.id, options);
            }
        }
        return runClient;
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
        const splitRules = { ...DEFAULT_SPLIT_RULES, ...overrideSplitRules };
        const inputChunks = generateInputChunks(sources, inputGenerator, splitRules, this.fixedInput);
        const runRequests = generateRunRequests(namePrefix, inputChunks, options);
        return this.startRuns(...runRequests);
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
        const splitRules = { ...DEFAULT_SPLIT_RULES, ...overrideSplitRules };
        const inputChunks = generateInputChunks(sources, inputGenerator, splitRules, this.fixedInput);
        const runRequests = generateRunRequests(namePrefix, inputChunks, options);
        return this.callRuns(...runRequests);
    }
}
