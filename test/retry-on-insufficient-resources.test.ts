import type { ActorRun } from 'apify-client';
import { ActorClient } from 'apify-client';
import { ExtApifyClient } from 'src/clients/apify-client.js';
import { DEFAULT_ORCHESTRATOR_OPTIONS, MAIN_LOOP_COOLDOWN_MS, MAIN_LOOP_INTERVAL_MS } from 'src/constants.js';
import { InsufficientActorJobsError, InsufficientMemoryError } from 'src/errors.js';
import type { OrchestratorOptions } from 'src/index.js';
import { RunsTracker } from 'src/tracker.js';
import * as apifyApi from 'src/utils/apify-api.js';
import { CustomLogger } from 'src/utils/logging.js';

const mockDate = new Date('2024-09-11T06:00:00.000Z');
const getMockRun = (id: string, status = 'READY', defaultDatasetId = 'test-dataset-id') => {
    return {
        id,
        status,
        defaultDatasetId,
        startedAt: mockDate,
    } as ActorRun;
};

describe('retry on insufficient resources', () => {
    let customLogger: CustomLogger;
    let runsTracker: RunsTracker;
    let options: OrchestratorOptions;

    const generateApifyClient = (clientName: string) =>
        new ExtApifyClient(
            clientName,
            customLogger,
            runsTracker,
            options.fixedInput,
            options.abortAllRunsOnGracefulAbort,
            options.hideSensitiveInformation,
            options.retryOnInsufficientResources,
        );

    beforeEach(async () => {
        vi.useFakeTimers();
        customLogger = new CustomLogger(false, false);
        runsTracker = new RunsTracker(customLogger, false);
        await runsTracker.init();
        options = {
            ...DEFAULT_ORCHESTRATOR_OPTIONS,
            enableLogs: false,
        };
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.resetAllMocks();
    });

    it('throws InsufficientMemoryError immediately when retry is disabled and memory is not enough', async () => {
        options.retryOnInsufficientResources = false;
        const client = generateApifyClient('no-retry-client-memory');
        client.startScheduler();

        const getUserLimitsSpy = vi.spyOn(apifyApi, 'getUserLimits').mockResolvedValue({
            currentMemoryUsageGBs: 7,
            maxMemoryGBs: 8,
            activeActorJobCount: 0,
            maxConcurrentActorJobs: 10,
        });
        const startSpy = vi.spyOn(ActorClient.prototype, 'start');

        const startPromise = client.actor('test-actor').start('test-run', undefined, { memory: 2_000 });

        vi.advanceTimersByTime(MAIN_LOOP_INTERVAL_MS);
        await expect(startPromise).rejects.toBeInstanceOf(InsufficientMemoryError);
        expect(getUserLimitsSpy).toHaveBeenCalledTimes(1);
        expect(startSpy).not.toHaveBeenCalled();
    });

    it('throws InsufficientActorJobsError immediately when retry is disabled and no jobs available', async () => {
        options.retryOnInsufficientResources = false;
        const client = generateApifyClient('no-retry-client-jobs');
        client.startScheduler();

        const getUserLimitsSpy = vi.spyOn(apifyApi, 'getUserLimits').mockResolvedValue({
            currentMemoryUsageGBs: 0,
            maxMemoryGBs: 100,
            activeActorJobCount: 5,
            maxConcurrentActorJobs: 5,
        });
        const startSpy = vi.spyOn(ActorClient.prototype, 'start');

        const startPromise = client.actor('test-actor').start('test-run', undefined, { memory: 256 });

        vi.advanceTimersByTime(MAIN_LOOP_INTERVAL_MS);
        await expect(startPromise).rejects.toBeInstanceOf(InsufficientActorJobsError);
        expect(getUserLimitsSpy).toHaveBeenCalledTimes(1);
        expect(startSpy).not.toHaveBeenCalled();
    });

    it('retries when retry is enabled: waits on insufficient memory and starts when resources become available', async () => {
        options.retryOnInsufficientResources = true;
        const client = generateApifyClient('retry-client');
        client.startScheduler();

        const getUserLimitsSpy = vi
            .spyOn(apifyApi, 'getUserLimits')
            // First call: not enough memory (8GB max, 7GB used; requires 2GB => only 1GB available)
            .mockResolvedValueOnce({
                currentMemoryUsageGBs: 7,
                maxMemoryGBs: 8,
                activeActorJobCount: 1,
                maxConcurrentActorJobs: 8,
            })
            // Second call (after cooldown): enough memory and jobs
            .mockResolvedValueOnce({
                currentMemoryUsageGBs: 1,
                maxMemoryGBs: 8,
                activeActorJobCount: 1,
                maxConcurrentActorJobs: 8,
            });

        const startSpy = vi
            .spyOn(ActorClient.prototype, 'start')
            .mockImplementation(async () => getMockRun('run-1', 'READY'));

        const startPromise = client.actor('test-actor').start('test-run', undefined, { memory: 2_000 });

        // First scheduler tick: detect insufficient resources and set cooldown, no start
        vi.advanceTimersByTime(MAIN_LOOP_INTERVAL_MS);
        await vi.waitUntil(() => !client.isSchedulerLocked, 2_000);
        expect(getUserLimitsSpy).toHaveBeenCalledTimes(1);
        expect(startSpy).not.toHaveBeenCalled();

        // Cooldown period: should not poll immediately
        vi.advanceTimersByTime(MAIN_LOOP_INTERVAL_MS);
        await vi.waitUntil(() => !client.isSchedulerLocked, 2_000);
        expect(getUserLimitsSpy).toHaveBeenCalledTimes(1);

        // Advance until cooldown elapses, then next tick should poll again and start the run
        for (let t = 0; t < MAIN_LOOP_COOLDOWN_MS; t += MAIN_LOOP_INTERVAL_MS) {
            vi.advanceTimersByTime(MAIN_LOOP_INTERVAL_MS);
            await vi.waitUntil(() => !client.isSchedulerLocked, 2_000);
        }

        const run = await startPromise;
        expect(getUserLimitsSpy).toHaveBeenCalledTimes(2);
        expect(startSpy).toHaveBeenCalledTimes(1);
        expect(run.id).toBe('run-1');
    });
});
