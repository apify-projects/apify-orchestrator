import { Actor, ApifyClient, log } from 'apify';
import { ApifyClientOptions, DatasetClientListItemOptions, RunClient } from 'apify-client';

import { IterableDatasetClient } from './iterable-dataset-client.js';
import { QueuedActorClient } from './queued-actor-client.js';
import { TrackingRunClient } from './tracking-run-client.js';
import { DEFAULT_ORCHESTRATOR_OPTIONS, MAIN_LOOP_INTERVAL_MS } from '../constants.js';
import { RunsTracker } from '../tracker.js';
import { DatasetItem, OrchestratorOptions, RunRecord } from '../types.js';
import { getAvailableMemoryGBs } from '../utils/apify-api.js';
import { disabledLogger, enabledLogger } from '../utils/logging.js';
import { Queue } from '../utils/queue.js';

export interface EnqueuedRequest {
    runName: string
    memoryMbytes: number
    readyCallback: (isReady: boolean) => void
}

export class OrchestratorApifyClient extends ApifyClient {
    protected runRequestsQueue = new Queue<EnqueuedRequest>();
    protected runsTracker = new RunsTracker();
    protected customLogger = disabledLogger;

    protected orchestratorOptions = DEFAULT_ORCHESTRATOR_OPTIONS;

    protected mainLoopId: NodeJS.Timeout | undefined;
    protected statsId: NodeJS.Timeout | undefined;

    constructor(options: ApifyClientOptions = {}) {
        if (!options.token) { options.token = Actor.apifyClient.token; }
        super(options);
    }

    override actor(id: string): QueuedActorClient {
        return new QueuedActorClient(
            super.actor(id),
            this.runRequestsQueue,
            this.customLogger,
            this.runsTracker,
            this.orchestratorOptions.fixedInput,
        );
    }

    override dataset<T extends DatasetItem>(id: string): IterableDatasetClient<T> {
        return new IterableDatasetClient<T>(super.dataset(id), this.customLogger);
    }

    override run(id: string): RunClient {
        const runName = this.runsTracker.findRunName(id);
        return runName ? this.trackedRun(runName, id) : super.run(id);
    }

    async startOrchestrator(orchestratorOptions = {} as Partial<OrchestratorOptions>) {
        this.customLogger.info('Starting the Apify orchestrator');

        this.orchestratorOptions = { ...DEFAULT_ORCHESTRATOR_OPTIONS, ...orchestratorOptions };

        // Init logger
        if (this.orchestratorOptions.enableLogs) { this.customLogger = enabledLogger; }

        // Init tracker
        await this.runsTracker.init(
            this.customLogger,
            this.orchestratorOptions.persistSupport,
            this.orchestratorOptions.persistPrefix,
        );

        // Main loop
        this.mainLoopId = setInterval(async () => {
            const nextRunRequest = this.runRequestsQueue.peek();
            if (!nextRunRequest) { return; }

            // Check if the next Run has enough memory available
            const availableMemoryGBs = await getAvailableMemoryGBs(this.token);
            const requiredMemoryGBs = nextRunRequest.memoryMbytes / 1024;
            const hasEnoughMemory = availableMemoryGBs >= requiredMemoryGBs;

            // Start the next run
            if (hasEnoughMemory) {
                const runRequest = this.runRequestsQueue.dequeue();
                if (runRequest) {
                    this.customLogger.prfxInfo(
                        nextRunRequest.runName,
                        'Starting next',
                        { requiredMemoryGBs, availableMemoryGBs, queue: this.runRequestsQueue.length },
                    );
                    runRequest.readyCallback(true);
                } else {
                    this.customLogger.error('Something wrong with the Apify orchestrator\'s queue!');
                }
            }
        }, MAIN_LOOP_INTERVAL_MS);

        this.statsId = this.orchestratorOptions.statsIntervalSec ? setInterval(() => {
            if (Object.keys(this.runsTracker.currentRuns).length === 0) {
                log.info('ORchestrator report: no Runs yet');
                return;
            }

            const report: Record<string, string[]> = {};

            for (const [runName, { status }] of Object.entries(this.runsTracker.currentRuns)) {
                if (!report[status]) {
                    report[status] = [];
                }
                report[status].push(runName);
            }

            const formattedReport = Object.entries(report)
                .map(([status, names]) => `    ${status}: ${names.join(', ')}`)
                .join('\n');

            log.info(`Orchestrator report:\n${formattedReport}`);
        }, this.orchestratorOptions.statsIntervalSec * 1000) : undefined;

        Actor.on('aborting', async () => {
            this.stopOrchestrator();
            if (this.orchestratorOptions.abortAllRunsOnGracefulAbort) {
                await this.abortAllRuns();
            }
        });
        Actor.on('exit', () => {
            this.stopOrchestrator();
        });
        Actor.on('migrating', () => {
            this.stopOrchestrator();
        });
    }

    stopOrchestrator() {
        this.customLogger.info('Stopping the Apify orchestrator');

        // Stop the main loop
        if (this.mainLoopId) { clearInterval(this.mainLoopId); }

        // Stop the stats logger
        if (this.statsId) { clearInterval(this.statsId); }

        // Empty the queues and unlock all the callers waiting
        while (this.runRequestsQueue.length > 0) {
            this.runRequestsQueue.dequeue()?.readyCallback(false);
        }
    }

    trackedRun(runName: string, id: string): TrackingRunClient {
        return new TrackingRunClient(
            super.run(id),
            runName,
            this.customLogger,
            this.runsTracker,
        );
    }

    async abortAllRuns() {
        log.info('Aborting runs', this.runsTracker.currentRuns);
        await Promise.all(Object.entries(this.runsTracker.currentRuns).map(async ([runName, runInfo]) => {
            try {
                await this.trackedRun(runName, runInfo.runId).abort();
            } catch (err) {
                log.exception(err as Error, 'Error aborting the Run', { runName });
            }
        }));
    }

    async waitForBatchFinish(runRecord: RunRecord): Promise<RunRecord> {
        const resultRunRecord: RunRecord = {};

        await Promise.all(Object.entries(runRecord).map(async ([runName, run]) => {
            const resultRun = await this.trackedRun(runName, run.id).waitForFinish();
            resultRunRecord[runName] = resultRun;
        }));

        return resultRunRecord;
    }

    async* iteratePaginatedOutput<T extends DatasetItem>(
        runRecord: RunRecord,
        pageSize: number,
        readOptions?: DatasetClientListItemOptions,
    ): AsyncGenerator<T, void, void> {
        for (const [runName, run] of Object.entries(runRecord)) {
            this.customLogger.prfxInfo(runName, 'Reading default dataset');
            const datasetIterator = this.dataset<T>(run.defaultDatasetId).iteratePaginated(pageSize, readOptions);
            for await (const item of datasetIterator) {
                yield item;
            }
        }
    }
}
