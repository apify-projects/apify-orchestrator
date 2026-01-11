import { RunClient } from 'apify-client';
import type { ExtApifyClient } from 'src/clients/apify-client.js';
import type { ExtRunClient } from 'src/clients/run-client.js';
import { RunTracker } from 'src/run-tracker.js';
import { getMockRun } from 'test/_helpers/mocks.js';
import { setupTestApifyClient } from 'test/_helpers/setup.js';

describe('ExtRunClient', () => {
    let apifyClient: ExtApifyClient;
    let runTracker: RunTracker;

    let runClient: ExtRunClient;

    const mockRun = getMockRun();

    beforeEach(async () => {
        const setup = await setupTestApifyClient();
        apifyClient = setup.apifyClient;

        runTracker = setup.runTracker;
        vi.spyOn(runTracker, 'updateRun');

        runClient = apifyClient.extendedRunClient('test-run', 'test-run-id');
    });

    afterEach(() => {
        vi.resetAllMocks();
    });

    describe('get', () => {
        it('updates the tracker when called', async () => {
            const getSpy = vi.spyOn(RunClient.prototype, 'get').mockImplementation(async () => mockRun);
            const run = await runClient.get();
            expect(run).toEqual(mockRun);
            expect(getSpy).toHaveBeenCalledTimes(1);
            expect(runTracker.updateRun).toHaveBeenCalledWith('test-run', mockRun);
        });

        it('declares a Run lost if not found', async () => {
            const getSpy = vi.spyOn(RunClient.prototype, 'get').mockImplementation(async () => null);
            const declareLostRunSpy = vi.spyOn(RunTracker.prototype, 'declareLostRun');
            const run = await runClient.get();
            expect(run).toEqual(null);
            expect(getSpy).toHaveBeenCalledTimes(1);
            expect(declareLostRunSpy).toHaveBeenCalledWith('test-run', 'Actor client could not retrieve the Run');
        });
    });

    describe('abort', () => {
        it('updates the tracker when called', async () => {
            const abortSpy = vi.spyOn(RunClient.prototype, 'abort').mockImplementation(async () => mockRun);
            const run = await runClient.abort();
            expect(run).toEqual(mockRun);
            expect(abortSpy).toHaveBeenCalledTimes(1);
            expect(runTracker.updateRun).toHaveBeenCalledWith('test-run', mockRun);
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
            const rebootSpy = vi.spyOn(RunClient.prototype, 'reboot').mockImplementation(async () => mockRun);
            const run = await runClient.reboot();
            expect(run).toEqual(mockRun);
            expect(rebootSpy).toHaveBeenCalledTimes(1);
            expect(runTracker.updateRun).toHaveBeenCalledWith('test-run', mockRun);
        });
    });

    describe('update', () => {
        it('updates the tracker when called', async () => {
            const updateSpy = vi.spyOn(RunClient.prototype, 'update').mockImplementation(async () => mockRun);
            const run = await runClient.update({ statusMessage: 'test' });
            expect(run).toEqual(mockRun);
            expect(updateSpy).toHaveBeenCalledTimes(1);
            expect(runTracker.updateRun).toHaveBeenCalledWith('test-run', mockRun);
        });
    });

    describe('resurrect', () => {
        it('updates the tracker when called', async () => {
            const resurrectSpy = vi.spyOn(RunClient.prototype, 'resurrect').mockResolvedValue(mockRun);
            const run = await runClient.resurrect();
            expect(run).toEqual(mockRun);
            expect(resurrectSpy).toHaveBeenCalledTimes(1);
            expect(runTracker.updateRun).toHaveBeenCalledWith('test-run', mockRun);
        });
    });

    describe('waitForFinish', () => {
        it('updates the tracker when called', async () => {
            const waitForFinishSpy = vi.spyOn(RunClient.prototype, 'waitForFinish').mockResolvedValue(mockRun);
            const run = await runClient.waitForFinish();
            expect(run).toEqual(mockRun);
            expect(waitForFinishSpy).toHaveBeenCalledTimes(1);
            expect(runTracker.updateRun).toHaveBeenCalledWith('test-run', mockRun);
        });
    });
});
