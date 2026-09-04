import type { ActorRun, Dictionary } from 'apify-client';

import { MAIN_LOOP_COOLDOWN_MS, MAIN_LOOP_INTERVAL_MS } from './constants.js';
import type { OrchestratorContext } from './context/orchestrator-context.js';
import { type RunSource, type RunStartOptions } from './entities/run-source.js';
import { isInsufficientResourcesError } from './errors.js';
import { Interval } from './utils/concurrency/interval.js';
import { TryCapacity } from './utils/concurrency/try-capacity.js';
import { TryCooldown } from './utils/concurrency/try-cooldown.js';
import { TryGate } from './utils/concurrency/try-gate.js';
import { TryLock } from './utils/concurrency/try-lock.js';
import { synchronizedAttempt, type TrySync } from './utils/concurrency/try-sync.js';
import { stringifyError } from './utils/errors.js';
import { RequestOutcome } from './utils/request-management/request.js';
import { RequestPool } from './utils/request-management/request-pool.js';
import { onActorShuttingDown } from './utils/run-lifecycle.js';
import { isDefined } from './utils/typing.js';

export interface RunStartRequest {
    source: RunSource;
    name: string;
    input?: Dictionary;
    options?: RunStartOptions;
}

export interface RunSchedulerOptions {
    runRequestAdapter: (request: RunStartRequest) => RunStartRequest;
    onRunStarted: (runName: string, run: ActorRun) => void;

    /**
     * Reads how many Runs are currently active, used to enforce `OrchestratorOptions.maxConcurrencyPerClient`.
     */
    countActiveRuns: () => number;
}

/**
 * Schedules Run start requests, ensuring that only one Run with a given name is started at a time,
 * that no more than `maxConcurrencyPerClient` Runs are active at the same time,
 * and providing retry capabilities with a cooldown in case of insufficient resources.
 *
 * The scheduler runs for the lifetime of the orchestrator and is stopped when the Actor is shutting down.
 */
export class RunScheduler {
    private readonly pool: RequestPool<RunStartRequest, ActorRun>;

    private readonly exclusiveLock = new TryLock(); // ensures only one request is processed at a time
    private readonly shutdownGate = new TryGate(); // prevents starting new runs during shutdown
    private readonly retryCooldown = new TryCooldown(MAIN_LOOP_COOLDOWN_MS); // cooldown between retries

    /**
     * The synchronizers which have to allow the execution before any single request is processed.
     */
    private readonly requestSynchronizers: TrySync[];

    private readonly interval: Interval;

    private readonly context: OrchestratorContext;
    private readonly options: RunSchedulerOptions;

    constructor(context: OrchestratorContext, options: RunSchedulerOptions) {
        this.context = context;
        this.options = options;

        this.requestSynchronizers = [this.shutdownGate, this.retryCooldown];
        const maxConcurrency = context.options.maxConcurrencyPerClient;
        if (isDefined(maxConcurrency)) {
            // Runs which are already active take up capacity, so no more than `maxConcurrency` are ever started.
            this.requestSynchronizers.push(new TryCapacity(maxConcurrency, options.countActiveRuns));
        }

        this.pool = new RequestPool<RunStartRequest, ActorRun>({
            onRequestAdded: (runName) => this.context.logger.prefixed(runName).info('Run start scheduled.'),
            onRequestSuccess: options.onRunStarted,
            onRequestFailure: (runName, error) => {
                this.context.logger.prefixed(runName).error('Run start failed.', { error: stringifyError(error) });
            },
            onRequestRetried: (runName, reason) => {
                this.context.logger.prefixed(runName).warning('Run start will be retried.', {
                    reason: stringifyError(reason),
                    cooldownMs: MAIN_LOOP_COOLDOWN_MS,
                });
            },
        });

        this.interval = new Interval(this.attemptProcessingAllRequests.bind(this), MAIN_LOOP_INTERVAL_MS);

        onActorShuttingDown(() => {
            this.interval.stop();
            this.shutdownGate.close();
        });
    }

    /**
     * @returns the promise to wait for the Run to start, or `undefined` if no such Run was requested.
     */
    findRunStartRequest(runName: string): (() => Promise<ActorRun>) | undefined {
        const request = this.pool.findRequest(runName);
        // Prefer `async () => request.wait()` to `request.wait` to avoid unbound method reference.
        return isDefined(request) ? async () => request.wait() : undefined;
    }

    /**
     * Requests starting a Run if one with the given name is not already being started.
     *
     * @returns the promise to wait for the Run to start.
     */
    requestRunStart(runRequest: RunStartRequest): () => Promise<ActorRun> {
        const request = this.pool.findOrAddRequest(runRequest.name, runRequest);
        // Prefer `async () => request.wait()` to `request.wait` to avoid unbound method reference.
        return async () => request.wait();
    }

    /**
     * Starts a new Run if one with the given name is not already being started.
     *
     * @returns the started Run.
     */
    async startRun(runRequest: RunStartRequest): Promise<ActorRun> {
        const request = this.pool.findOrAddRequest(runRequest.name, runRequest);

        // Attempt to process the request immediately, without waiting for the next interval tick.
        // If the attempt fails, the scheduler will try again on the next tick, as usual.
        await synchronizedAttempt(
            async () => request.process(this.processRunRequest.bind(this)),
            [this.exclusiveLock, ...this.requestSynchronizers],
        );

        return request.wait();
    }

    /**
     * Try processing all pending requests, one by one.
     */
    private async attemptProcessingAllRequests(): Promise<void> {
        // Lock the processing once at the beginning, to ensure only one attempt is running at a time.
        await this.exclusiveLock.attempt(async () => {
            for (const request of this.pool.getPendingRequests()) {
                const syncOutcome = await synchronizedAttempt(
                    async () => request.process(this.processRunRequest.bind(this)),
                    // Check for shutdown, retry cooldown, and available capacity between each request.
                    this.requestSynchronizers,
                );
                const requestProcessed = syncOutcome.match({
                    executed: () => true,
                    blocked: (reason) => {
                        this.context.logger.debug('Deferring Run starts.', { reason });
                        return false;
                    },
                });
                // If we get blocked by a synchronizer, we stop processing further requests in this attempt.
                if (!requestProcessed) break;
            }
        });
    }

    private async processRunRequest(request: RunStartRequest): Promise<RequestOutcome<ActorRun>> {
        const adaptedRequest = this.options.runRequestAdapter(request);
        try {
            const run = await adaptedRequest.source.start(adaptedRequest.input, adaptedRequest.options);
            return new RequestOutcome({ success: run });
        } catch (error) {
            const parsedError = await adaptedRequest.source.parseRunStartError(
                error,
                adaptedRequest.name,
                adaptedRequest.options,
            );
            const { retryOnInsufficientResources } = this.context.options;
            const shouldRetry = retryOnInsufficientResources && isInsufficientResourcesError(parsedError);
            if (shouldRetry) {
                this.retryCooldown.activate();
                return new RequestOutcome({ retry: parsedError });
            }
            return new RequestOutcome({ failure: parsedError });
        }
    }
}
