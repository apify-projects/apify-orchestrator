import type { ActorRun } from 'apify-client';
import { ActorClient } from 'apify-client';
import { ExtApifyClient } from 'src/clients/apify-client.js';
import { DEFAULT_ORCHESTRATOR_OPTIONS, MAIN_LOOP_COOLDOWN_MS, MAIN_LOOP_INTERVAL_MS } from 'src/constants.js';
import { InsufficientActorJobsError, InsufficientMemoryError } from 'src/errors.js';
import type { OrchestratorOptions } from 'src/index.js';
import { buildRunTrackerForOrchestrator } from 'src/tracking/builder.js';
import { parseStartRunError } from 'src/utils/apify-client.js';
import type { OrchestratorContext } from 'src/utils/context.js';

import { getTestGlobalContext, getTestOptions } from './_helpers/context.js';

vi.mock('src/utils/apify-client.js', async (importActual) => {
    return {
        ...(await importActual()),
        parseStartRunError: vi.fn(),
    };
});

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
    let context: OrchestratorContext;
    let options: OrchestratorOptions;

    const generateApifyClient = (clientName: string) => new ExtApifyClient(context, { clientName, ...options });

    beforeEach(async () => {
        vi.useFakeTimers();
        options = getTestOptions();
        const globalContext = getTestGlobalContext(options);
        const { logger } = globalContext;
        const runTracker = await buildRunTrackerForOrchestrator(globalContext, options);
        context = { logger, runTracker };
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

        const startSpy = vi.spyOn(ActorClient.prototype, 'start');
        startSpy.mockRejectedValue(new Error('test-error'));
        vi.mocked(parseStartRunError).mockResolvedValue(new InsufficientMemoryError('test-run', 0));

        const startPromise = client.actor('test-actor').start('test-run', undefined, { memory: 2_000 });

        vi.advanceTimersByTime(MAIN_LOOP_INTERVAL_MS);
        await expect(startPromise).rejects.toBeInstanceOf(InsufficientMemoryError);
        expect(startSpy).toHaveBeenCalledTimes(1);
    });

    it('throws InsufficientActorJobsError immediately when retry is disabled and no jobs available', async () => {
        options.retryOnInsufficientResources = false;
        const client = generateApifyClient('no-retry-client-jobs');
        client.startScheduler();

        const startSpy = vi.spyOn(ActorClient.prototype, 'start');
        startSpy.mockRejectedValue(new Error('test-error'));
        vi.mocked(parseStartRunError).mockResolvedValue(new InsufficientActorJobsError('test-run'));

        const startPromise = client.actor('test-actor').start('test-run', undefined, { memory: 256 });

        vi.advanceTimersByTime(MAIN_LOOP_INTERVAL_MS);
        await expect(startPromise).rejects.toBeInstanceOf(InsufficientActorJobsError);
        expect(startSpy).toHaveBeenCalledTimes(1);
    });

    it('retries when retry is enabled: waits on insufficient memory and starts when resources become available', async () => {
        options.retryOnInsufficientResources = true;
        const client = generateApifyClient('retry-client');
        client.startScheduler();

        const startSpy = vi.spyOn(ActorClient.prototype, 'start');
        startSpy.mockRejectedValueOnce(new Error('test-error'));
        vi.mocked(parseStartRunError).mockResolvedValueOnce(new InsufficientMemoryError('test-run', 0));
        startSpy.mockResolvedValueOnce(getMockRun('run-1', 'READY'));

        const startPromise = client.actor('test-actor').start('test-run', undefined, { memory: 2_000 });

        // First scheduler tick: detect insufficient resources and set cooldown, no start
        vi.advanceTimersByTime(MAIN_LOOP_INTERVAL_MS);
        await vi.waitUntil(() => !client.isSchedulerLocked, 2_000);
        expect(startSpy).toHaveBeenCalledTimes(1);

        // Cooldown period: should not poll immediately
        vi.advanceTimersByTime(MAIN_LOOP_INTERVAL_MS);
        await vi.waitUntil(() => !client.isSchedulerLocked, 2_000);
        expect(startSpy).toHaveBeenCalledTimes(1);

        // Advance until cooldown elapses, then next tick should poll again and start the run
        for (let t = 0; t < MAIN_LOOP_COOLDOWN_MS; t += MAIN_LOOP_INTERVAL_MS) {
            vi.advanceTimersByTime(MAIN_LOOP_INTERVAL_MS);
            await vi.waitUntil(() => !client.isSchedulerLocked, 2_000);
        }

        const run = await startPromise;
        expect(startSpy).toHaveBeenCalledTimes(2);
        expect(run.id).toBe('run-1');
    });
});
