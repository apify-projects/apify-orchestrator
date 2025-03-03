import { ActorRun, ApifyClient } from 'apify-client';
import { EnqueueFunction, ExtActorClient, ForcedEnqueueFunction } from 'src/clients/actor-client.js';
import { RunsTracker } from 'src/tracker.js';
import { CustomLogger } from 'src/utils/logging.js';
import { Mock } from 'vitest';

describe('actor-client methods', () => {
    let customLogger: CustomLogger;
    let runsTracker: RunsTracker;
    let enqueueFunction: Mock<EnqueueFunction>;
    let forcedEnqueueFunction: ForcedEnqueueFunction;

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
        enqueueFunction = vi.fn();
        forcedEnqueueFunction = vi.fn();
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
            const fixedInput = { fixedKey: 'fixedValue' };

            const mockRun = getMockRun('test-run-id');

            enqueueFunction = vi.fn(({ startCallbacks }) => {
                startCallbacks[0](mockRun);
            });

            const sdkApifyClient = new ApifyClient();
            const sdkActorClient = sdkApifyClient.actor('test-actor-id');
            const actorClient = new ExtActorClient(
                sdkActorClient,
                customLogger,
                runsTracker,
                enqueueFunction,
                forcedEnqueueFunction,
                fixedInput,
            );

            const run = await actorClient.start('test-run', { someKey: 'someValue' });

            expect(enqueueFunction).toBeCalledWith({
                runName: 'test-run',
                defaultMemoryMbytes: expect.anything(),
                input: {
                    someKey: 'someValue',
                    fixedKey: 'fixedValue',
                },
                options: undefined,
                startCallbacks: expect.anything(),
                startRun: expect.anything(),
            });
            expect(run).toEqual(mockRun);
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
