import { ActorClient, ActorRun, RunClient } from 'apify-client';
import { ExtApifyClient } from 'src/clients/apify-client.js';
import { ExtRunClient } from 'src/clients/run-client.js';
import { DEFAULT_ORCHESTRATOR_OPTIONS, MAIN_LOOP_INTERVAL_MS } from 'src/constants.js';
import { RunsTracker } from 'src/tracker.js';
import { OrchestratorOptions, RunInfo } from 'src/types.js';
import * as apifyApi from 'src/utils/apify-api.js';
import { CustomLogger } from 'src/utils/logging.js';
import { MockInstance } from 'vitest';

describe('run-client', () => {
    let customLogger: CustomLogger;
    let runsTracker: RunsTracker;
    let options: OrchestratorOptions;
    let updateRunSpy: MockInstance<(runName: string, run: ActorRun) => Promise<RunInfo>>;
    let runClient: ExtRunClient;

    const mockDate = new Date('2024-09-11T06:00:00.000Z');
    const mockRun = {
        id: 'test-id',
        status: 'READY',
        defaultDatasetId: 'test-dataset-id',
        startedAt: mockDate,
    } as ActorRun;

    const generateApifyClient = () => new ExtApifyClient(
        'test-client',
        customLogger,
        runsTracker,
        options.fixedInput,
        options.abortAllRunsOnGracefulAbort,
        options.hideSensibleInformation,
        !!options.onUpdate,
    );

    async function generateExtRunClient(runName: string) {
        vi.spyOn(apifyApi, 'getUserLimits')
            .mockImplementationOnce(async () => {
                return {
                    currentMemoryUsageGBs: 1,
                    maxMemoryGBs: 8,
                    activeActorJobCount: 3,
                    maxConcurrentActorJobs: 8,
                };
            });
        const startSpy = vi.spyOn(ActorClient.prototype, 'start')
            .mockImplementation(async () => mockRun);

        const client = generateApifyClient();
        client.startScheduler();
        client.actor('test-actor').enqueue({ runName, options: { memory: 2_000 } });
        vi.advanceTimersByTime(MAIN_LOOP_INTERVAL_MS);
        await vi.waitUntil(() => !client.isSchedulerLocked, 2_000);
        expect(startSpy).toHaveBeenCalledTimes(1);

        return client.run('test-id') as ExtRunClient;
    }

    beforeEach(async () => {
        vi.useFakeTimers();
        customLogger = new CustomLogger(false, false);
        runsTracker = new RunsTracker(customLogger, false);
        await runsTracker.init();
        options = {
            ...DEFAULT_ORCHESTRATOR_OPTIONS,
            enableLogs: false,
        };
        updateRunSpy = vi.spyOn(RunsTracker.prototype, 'updateRun');
        runClient = await generateExtRunClient('test-run');
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.resetAllMocks();
    });

    describe('get', () => {
        it('updates the tracker when called', async () => {
            const getSpy = vi.spyOn(RunClient.prototype, 'get')
                .mockImplementation(async () => mockRun);
            const run = await runClient.get();
            expect(run).toEqual(mockRun);
            expect(getSpy).toHaveBeenCalledTimes(1);
            expect(updateRunSpy).toHaveBeenCalledTimes(2); // start + get
            expect(updateRunSpy).toHaveBeenCalledWith('test-run', mockRun);
        });

        it('declares a Run lost if not found', async () => {
            const getSpy = vi.spyOn(RunClient.prototype, 'get')
                .mockImplementation(async () => null);
            const declareLostRunSpy = vi.spyOn(RunsTracker.prototype, 'declareLostRun');
            const run = await runClient.get();
            expect(run).toEqual(null);
            expect(getSpy).toHaveBeenCalledTimes(1);
            expect(declareLostRunSpy).toHaveBeenCalledTimes(1);
            expect(declareLostRunSpy).toHaveBeenCalledWith('test-run', 'Actor client could not retrieve the Run');
        });
    });

    describe('abort', () => {
        it('updates the tracker when called', async () => {
            const abortSpy = vi.spyOn(RunClient.prototype, 'abort')
                .mockImplementation(async () => mockRun);
            const run = await runClient.abort();
            expect(run).toEqual(mockRun);
            expect(abortSpy).toHaveBeenCalledTimes(1);
            expect(updateRunSpy).toHaveBeenCalledTimes(2); // start + get
            expect(updateRunSpy).toHaveBeenCalledWith('test-run', mockRun);
        });
    });

    describe('delete', () => {
        it('updates the tracker when called', () => {
            // TODO: test after implementation
        });
    });

    describe('metamorph', () => {
        it('updates the tracker when called', () => {
            // TODO: test after implementation
        });
    });

    describe('reboot', () => {
        it('updates the tracker when called', async () => {
            const rebootSpy = vi.spyOn(RunClient.prototype, 'reboot')
                .mockImplementation(async () => mockRun);
            const run = await runClient.reboot();
            expect(run).toEqual(mockRun);
            expect(rebootSpy).toHaveBeenCalledTimes(1);
            expect(updateRunSpy).toHaveBeenCalledTimes(2); // start + get
            expect(updateRunSpy).toHaveBeenCalledWith('test-run', mockRun);
        });
    });

    describe('update', () => {
        it('updates the tracker when called', async () => {
            const updateSpy = vi.spyOn(RunClient.prototype, 'update')
                .mockImplementation(async () => mockRun);
            const run = await runClient.update({ statusMessage: 'test' });
            expect(run).toEqual(mockRun);
            expect(updateSpy).toHaveBeenCalledTimes(1);
            expect(updateRunSpy).toHaveBeenCalledTimes(2); // start + get
            expect(updateRunSpy).toHaveBeenCalledWith('test-run', mockRun);
        });
    });

    describe('resurrect', () => {
        it('updates the tracker when called', async () => {
            const resurrectSpy = vi.spyOn(RunClient.prototype, 'resurrect')
                .mockImplementation(async () => mockRun);
            const run = await runClient.resurrect();
            expect(run).toEqual(mockRun);
            expect(resurrectSpy).toHaveBeenCalledTimes(1);
            expect(updateRunSpy).toHaveBeenCalledTimes(2); // start + get
            expect(updateRunSpy).toHaveBeenCalledWith('test-run', mockRun);
        });
    });

    describe('waitForFinish', () => {
        it('updates the tracker when called', async () => {
            const waitForFinishSpy = vi.spyOn(RunClient.prototype, 'waitForFinish')
                .mockImplementation(async () => mockRun);
            const run = await runClient.waitForFinish();
            expect(run).toEqual(mockRun);
            expect(waitForFinishSpy).toHaveBeenCalledTimes(1);
            expect(updateRunSpy).toHaveBeenCalledTimes(2); // start + get
            expect(updateRunSpy).toHaveBeenCalledWith('test-run', mockRun);
        });
    });
});
