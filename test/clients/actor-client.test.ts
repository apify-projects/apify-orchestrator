import { ActorClient, ActorRun } from 'apify-client';
import { ExtApifyClient } from 'src/clients/apify-client.js';
import { DEFAULT_ORCHESTRATOR_OPTIONS, MAIN_LOOP_COOLDOWN_MS } from 'src/constants.js';
import { RunsTracker } from 'src/tracker.js';
import { OrchestratorOptions } from 'src/types.js';
import * as apifyApi from 'src/utils/apify-api.js';
import { CustomLogger } from 'src/utils/logging.js';

// TODO: take a look at `enqueues a new request with the fixed input, if defined`,
// and extract common utilities for writing other tests.

describe('actor-client methods', () => {
    let customLogger: CustomLogger;
    let runsTracker: RunsTracker;
    let options: OrchestratorOptions;

    const generateApifyClient = (clientName: string) => new ExtApifyClient(
        clientName,
        customLogger,
        runsTracker,
        options.fixedInput,
        options.abortAllRunsOnGracefulAbort,
        options.hideSensibleInformation,
    );

    const mockDate = new Date('2024-09-11T06:00:00.000Z');

    const getMockRun = (id: string, status = 'READY', defaultDatasetId = 'test-dataset-id') => {
        return {
            id,
            status,
            defaultDatasetId,
            startedAt: mockDate,
        } as ActorRun;
    };

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

    describe('start', () => {
        it('returns an existing Run, if already available', async () => {
            // TODO: test
        });

        it('enqueues a new request, if an existing Run was found but not available', async () => {
            // TODO: test
        });

        it('enqueues a new request, if an existing Run was not found', async () => {
            // TODO: test
        });

        it('enqueues a new request with the fixed input, if defined', async () => {
            options.fixedInput = { testKey: 'testValue' };
            const client = generateApifyClient('test-client');
            client.startScheduler();
            const actorClient = client.actor('test-actor-id');

            // Necessary to start a new run
            vi.spyOn(apifyApi, 'getUserLimits').mockImplementationOnce(async () => {
                return {
                    currentMemoryUsageGBs: 1,
                    maxMemoryGBs: 8,
                    activeActorJobCount: 1,
                    maxConcurrentActorJobs: 8,
                };
            });

            const startSpy = vi.spyOn(ActorClient.prototype, 'start')
                .mockImplementation(async () => { return getMockRun('test-id'); });

            const runInput = { runTestKey: 'runTestValue' };
            const startPromise = actorClient.start('test-run', runInput);
            vi.advanceTimersByTime(MAIN_LOOP_COOLDOWN_MS);
            await vi.waitUntil(() => !client.isSchedulerLocked, 2_000);
            await startPromise;
            expect(startSpy).toHaveBeenCalledWith(
                { ...options.fixedInput, ...runInput },
                undefined,
            );
        });
    });

    describe('call', () => {
        it('waits for an existing Run, if already available', () => {
            // TODO: test
        });

        it('starts a new Run and waits for it, if an existing Run was found but not available', () => {
            // TODO: test
        });

        it('starts a new Run and waits for it, if an existing Run was not found', () => {
            // TODO: test
        });
    });

    describe('lastRun', () => {
        it('returns a TrackedRunClient if the Run ID is found in the tracker', () => {
            // TODO: test
        });

        it('returns a regular RunClient if the Run was not tracked', () => {
            // TODO: test
        });
    });

    describe('enqueue', () => {
        it('enqueues a single Run request', () => {
            // TODO: test
        });

        it('enqueues multiple Run requests', () => {
            // TODO: test
        });
    });

    describe('enqueueBatch', () => {
        it('splits the input according to the rules', () => {
            // TODO: test
        });
    });

    describe('startRuns', () => {
        it('starts multiple Runs', () => {
            // TODO: test
        });
    });

    describe('startBatch', () => {
        it('splits the input and starts multiple Runs', () => {
            // TODO: test
        });
    });

    describe('callRuns', () => {
        it('starts multiple Runs and waits for them to finish', () => {
            // TODO: test
        });
    });

    describe('callBatch', () => {
        it('splits the input, starts multiple Runs and waits for them to finish', () => {
            // TODO: test
        });
    });
});
