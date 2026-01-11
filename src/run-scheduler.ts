import type { ActorRun, Dictionary } from 'apify-client';

import { MAIN_LOOP_COOLDOWN_MS, MAIN_LOOP_INTERVAL_MS } from './constants.js';
import { type RunSource, type RunStartOptions } from './entities/run-source.js';
import { isInsufficientResourcesError } from './errors.js';
import { Interval } from './utils/concurrency/interval.js';
import { TryCooldown } from './utils/concurrency/try-cooldown.js';
import { TryGate } from './utils/concurrency/try-gate.js';
import { TryLock } from './utils/concurrency/try-lock.js';
import type { OrchestratorContext } from './utils/context.js';
import { stringifyError } from './utils/errors.js';
import { onActorShuttingDown } from './utils/run-lifecycle.js';
import { RequestOutcome } from './utils/scheduling/request-outcome.js';
import { RequestPool } from './utils/scheduling/request-pool.js';

export interface RunStartRequest {
    source: RunSource;
    name: string;
    input?: Dictionary;
    options?: RunStartOptions;
}

export interface RunSchedulerOptions {
    retryOnInsufficientResources: boolean;
    onRunStarted: (runName: string, run: ActorRun) => void;
}

/**
 * Schedules Run start requests, ensuring that only one Run with a given name is started at a time,
 * and providing retry capabilities with a cooldown in case of insufficient resources.
 *
 * The scheduler runs for the lifetime of the orchestrator and is stopped when the Actor is shutting down.
 */
export class RunScheduler {
    private readonly pool: RequestPool<RunStartRequest, ActorRun>;

    private readonly shutdownGate = new TryGate(); // prevent starting new runs during shutdown
    private readonly exclusiveLock = new TryLock(); // ensure only one request is processed at a time
    private readonly retryCooldown = new TryCooldown(MAIN_LOOP_COOLDOWN_MS); // cooldown between retries

    private readonly interval = new Interval(this.processAllRunRequests.bind(this), MAIN_LOOP_INTERVAL_MS);

    constructor(
        private readonly context: OrchestratorContext,
        private readonly options: RunSchedulerOptions,
    ) {
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

        onActorShuttingDown(() => {
            this.interval.stop();
            this.shutdownGate.close();
        });
    }

    /**
     * Requests starting a Run if one with the given name is not already being started.
     *
     * @returns the promise to wait for the Run to start.
     */
    requestRunStart(runRequest: RunStartRequest): () => Promise<ActorRun> {
        return this.pool.findOrAddRequest(runRequest.name, runRequest);
    }

    /**
     * @returns the promise to wait for the Run to start, or `undefined` if no such Run was requested.
     */
    findRunStartRequest(runName: string): (() => Promise<ActorRun>) | undefined {
        return this.pool.findRequest(runName);
    }

    private async processAllRunRequests(): Promise<void> {
        await this.pool.attemptProcessingAllRequests(this.processRunRequest, [
            this.shutdownGate,
            this.exclusiveLock,
            this.retryCooldown,
        ]);
    }

    private async processRunRequest(request: RunStartRequest): Promise<RequestOutcome<ActorRun>> {
        try {
            const run = await request.source.start(request.input, request.options);
            return RequestOutcome.success(run);
        } catch (error) {
            const parsedError = await request.source.parseRunStartError(error, request.name, request.options);
            if (this.shouldRetryRequest(parsedError)) {
                this.retryCooldown.activate();
                return RequestOutcome.retry(parsedError);
            }
            return RequestOutcome.failure(parsedError);
        }
    }

    private shouldRetryRequest(error: unknown): boolean {
        return this.options.retryOnInsufficientResources && isInsufficientResourcesError(error);
    }
}
