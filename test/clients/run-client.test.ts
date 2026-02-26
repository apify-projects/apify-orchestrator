import { RunClient } from 'apify-client';
import { ExtApifyClient } from 'src/clients/apify-client.js';
import type { ExtRunClient } from 'src/clients/run-client.js';
import type { ClientContext } from 'src/context/client-context.js';
import { getClientContext } from 'test/_helpers/context.js';
import { createActorRunMock } from 'test/_helpers/mocks.js';

describe('ExtRunClient', () => {
    let context: ClientContext;
    let runClient: ExtRunClient;

    const mockRun = createActorRunMock();

    beforeEach(() => {
        context = getClientContext();
        const client = new ExtApifyClient('test-client', context, {});

        vi.spyOn(context.runTracker, 'updateRun');

        runClient = client.extendedRunClient('test-run', 'test-run-id');
    });

    afterEach(() => {
        vi.resetAllMocks();
    });

    describe('get', () => {
        it('updates the tracker when called', async () => {
            const getSpy = vi.spyOn(RunClient.prototype, 'get').mockResolvedValue(mockRun);
            const run = await runClient.get();
            expect(run).toEqual(mockRun);
            expect(getSpy).toHaveBeenCalledTimes(1);
            expect(context.runTracker.updateRun).toHaveBeenCalledWith('test-run', mockRun);
        });

        it('updates the tracker when the run is not found', async () => {
            const getSpy = vi.spyOn(RunClient.prototype, 'get').mockResolvedValue(undefined);
            const run = await runClient.get();
            expect(run).toBeUndefined();
            expect(getSpy).toHaveBeenCalledTimes(1);
            expect(context.runTracker.updateRun).toHaveBeenCalledWith('test-run', undefined);
        });
    });

    describe('abort', () => {
        it('updates the tracker when called', async () => {
            const abortSpy = vi.spyOn(RunClient.prototype, 'abort').mockResolvedValue(mockRun);
            const run = await runClient.abort();
            expect(run).toEqual(mockRun);
            expect(abortSpy).toHaveBeenCalledTimes(1);
            expect(context.runTracker.updateRun).toHaveBeenCalledWith('test-run', mockRun);
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
            const rebootSpy = vi.spyOn(RunClient.prototype, 'reboot').mockResolvedValue(mockRun);
            const run = await runClient.reboot();
            expect(run).toEqual(mockRun);
            expect(rebootSpy).toHaveBeenCalledTimes(1);
            expect(context.runTracker.updateRun).toHaveBeenCalledWith('test-run', mockRun);
        });
    });

    describe('update', () => {
        it('updates the tracker when called', async () => {
            const updateSpy = vi.spyOn(RunClient.prototype, 'update').mockResolvedValue(mockRun);
            const run = await runClient.update({ statusMessage: 'test' });
            expect(run).toEqual(mockRun);
            expect(updateSpy).toHaveBeenCalledTimes(1);
            expect(context.runTracker.updateRun).toHaveBeenCalledWith('test-run', mockRun);
        });
    });

    describe('resurrect', () => {
        it('updates the tracker when called', async () => {
            const resurrectSpy = vi.spyOn(RunClient.prototype, 'resurrect').mockResolvedValue(mockRun);
            const run = await runClient.resurrect();
            expect(run).toEqual(mockRun);
            expect(resurrectSpy).toHaveBeenCalledTimes(1);
            expect(context.runTracker.updateRun).toHaveBeenCalledWith('test-run', mockRun);
        });
    });

    describe('waitForFinish', () => {
        it('updates the tracker when called', async () => {
            const waitForFinishSpy = vi.spyOn(RunClient.prototype, 'waitForFinish').mockResolvedValue(mockRun);
            const run = await runClient.waitForFinish();
            expect(run).toEqual(mockRun);
            expect(waitForFinishSpy).toHaveBeenCalledTimes(1);
            expect(context.runTracker.updateRun).toHaveBeenCalledWith('test-run', mockRun);
        });
    });
});
