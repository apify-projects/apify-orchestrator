import { RunClient } from 'apify-client';
import { ExtRunClient } from 'src/clients/run-client.js';
import { RunSource } from 'src/entities/run-source.js';
import { Orchestrator } from 'src/index.js';
import { getClientContext } from 'test/_helpers/context.js';
import { createActorRunMock } from 'test/_helpers/mocks.js';
import { afterEach, describe, expect, it } from 'vitest';

describe('OrchestratingClient', () => {
    const startRun = vi.fn();
    const defaultMemoryMbytes = vi.fn();
    const runSource = new RunSource(startRun, defaultMemoryMbytes);

    afterEach(() => {
        vi.resetAllMocks();
        vi.useRealTimers();
    });

    describe('searchExistingRun', () => {
        it('returns a promise if the Run is scheduled to start', () => {
            const context = getClientContext();

            context.runScheduler.requestRunStart({ name: 'scheduled-run', source: runSource });

            const outcome = context.searchExistingRun('scheduled-run');
            expect(outcome.variant).toBe('promise');
            expect(outcome.value).toBeInstanceOf(Function);
        });

        it('returns run info if the Run is tracked', () => {
            const context = getClientContext();

            const existingRun = createActorRunMock({ id: 'tracked-run-id' });
            context.runTracker.updateRun('tracked-run', existingRun);

            const outcome = context.searchExistingRun('tracked-run');
            expect(outcome.variant).toBe('runInfo');
            expect(outcome.value).toEqual(expect.objectContaining({ runId: 'tracked-run-id' }));
        });

        it('returns notFound if the Run does not exist', () => {
            const context = getClientContext();

            const outcome = context.searchExistingRun('nonexistent-run');
            expect(outcome.variant).toBe('notFound');
            expect(outcome.value).toBe(true);
        });
    });

    describe('extendRunClient', () => {
        it('returns an extended RunClient', async () => {
            const context = getClientContext();
            const orchestrator = new Orchestrator();
            const client = await orchestrator.apifyClient();

            const runClient = client.run('test-run-id');
            const extRunClient = context.extendRunClient('test-run', runClient);
            expect(extRunClient).toBeInstanceOf(ExtRunClient);
            expect(extRunClient.runName).toBe('test-run');

            const updateRunSpy = vi.spyOn(context.runTracker, 'updateRun');
            const getRunSpy = vi
                .spyOn(RunClient.prototype, 'get')
                .mockResolvedValue(createActorRunMock({ id: 'test-run-id' }));

            const run = await extRunClient.get();
            expect(run).toBeDefined();
            expect(getRunSpy).toHaveBeenCalled();
            expect(updateRunSpy).toHaveBeenCalledWith('test-run', run);
        });
    });
});
