import type { ApifyEnv } from 'apify';
import { Actor } from 'apify';
import { ActorClient } from 'apify-client';
import { MAIN_LOOP_INTERVAL_MS } from 'src/constants.js';
import type { DatasetItem } from 'src/index.js';
import { Orchestrator } from 'src/index.js';
import { createActorRunMock } from 'test/_helpers/mocks.js';

describe('Apify Orchestrator', () => {
    let orchestrator: Orchestrator;

    beforeEach(async () => {
        vi.useFakeTimers();
        orchestrator = new Orchestrator({
            enableLogs: false,
        });
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.resetAllMocks();
    });

    it('makes persist prefixes unique', () => {
        const orchestrator1 = new Orchestrator({ persistencePrefix: 'TEST-' });
        const orchestrator2 = new Orchestrator({ persistencePrefix: 'TEST-' });

        expect(orchestrator1.options.persistencePrefix).toEqual('TEST-');
        expect(orchestrator2.options.persistencePrefix).toEqual('TEST-2-');
    });

    it('takes the token from the environment if not provided', async () => {
        const getEnvSpy = vi.spyOn(Actor, 'getEnv').mockReturnValue({ token: 'my-env-token' } as ApifyEnv);
        const client = await orchestrator.apifyClient({ name: 'client-without-token' });
        expect(getEnvSpy).toHaveBeenCalled();
        expect(client.token).toEqual('my-env-token');
    });

    it('starts the scheduler upon client creation', async () => {
        const startSpy = vi.spyOn(ActorClient.prototype, 'start');
        const client = await orchestrator.apifyClient({ name: 'client-going-to-start' });
        client.actor('test').enqueue({ runName: 'test' });
        vi.advanceTimersByTime(MAIN_LOOP_INTERVAL_MS);
        expect(startSpy).toHaveBeenCalledTimes(1);
    });

    it('makes client names unique', async () => {
        const client1 = await orchestrator.apifyClient({ name: 'test' });
        const client2 = await orchestrator.apifyClient({ name: 'test' });

        expect(client1.clientName).toEqual('test');
        expect(client2.clientName).toEqual('test-2');
    });

    it('gives clients a default unique name', async () => {
        const client1 = await orchestrator.apifyClient();
        const client2 = await orchestrator.apifyClient();

        expect(client1.clientName).toEqual('CLIENT');
        expect(client2.clientName).toEqual('CLIENT-2');
    });

    it('lets you create a dataset group', async () => {
        interface Item extends DatasetItem {
            title: string;
        }
        const client = await orchestrator.apifyClient();
        const dataset1 = client.dataset<Item>('test-id1');
        const dataset2 = client.dataset<Item>('test-id2');
        const dataset3 = client.dataset<Item>('test-id3');
        const mergedDatasets = orchestrator.mergeDatasets(dataset1, dataset2, dataset3);
        expect(mergedDatasets.datasets).toEqual([dataset1, dataset2, dataset3]);
    });

    describe('maxConcurrencyPerClient', () => {
        function mockActorStart() {
            return vi
                .spyOn(ActorClient.prototype, 'start')
                .mockImplementation(async () => createActorRunMock({ status: 'RUNNING' }));
        }

        it('limits how many Runs are started at the same time', async () => {
            const startSpy = mockActorStart();
            const limitedOrchestrator = new Orchestrator({ enableLogs: false, maxConcurrencyPerClient: 1 });
            const client = await limitedOrchestrator.apifyClient({ name: 'limited-client' });

            client.actor('test').enqueue({ runName: 'run-1' }, { runName: 'run-2' }, { runName: 'run-3' });
            await vi.advanceTimersByTimeAsync(MAIN_LOOP_INTERVAL_MS * 3);

            expect(startSpy).toHaveBeenCalledTimes(1);
        });

        it('applies the limit to each client separately', async () => {
            const startSpy = mockActorStart();
            const limitedOrchestrator = new Orchestrator({ enableLogs: false, maxConcurrencyPerClient: 1 });
            const client1 = await limitedOrchestrator.apifyClient({ name: 'limited-client-1' });
            const client2 = await limitedOrchestrator.apifyClient({ name: 'limited-client-2' });

            client1.actor('test').enqueue({ runName: 'run-1' }, { runName: 'run-2' });
            client2.actor('test').enqueue({ runName: 'run-3' }, { runName: 'run-4' });
            await vi.advanceTimersByTimeAsync(MAIN_LOOP_INTERVAL_MS * 3);

            // Each client has its own scheduler, so each of them starts one Run.
            expect(startSpy).toHaveBeenCalledTimes(2);
        });

        it('does not limit the concurrency by default', async () => {
            const startSpy = mockActorStart();
            const client = await orchestrator.apifyClient({ name: 'unlimited-client' });

            client.actor('test').enqueue({ runName: 'run-1' }, { runName: 'run-2' }, { runName: 'run-3' });
            await vi.advanceTimersByTimeAsync(MAIN_LOOP_INTERVAL_MS);

            expect(startSpy).toHaveBeenCalledTimes(3);
        });

        it('rejects a limit which is not a positive integer', () => {
            for (const maxConcurrencyPerClient of [0, -1, 1.5, Number.NaN]) {
                expect(() => new Orchestrator({ enableLogs: false, maxConcurrencyPerClient })).toThrow(RangeError);
            }
        });
    });

    // TODO: test different configurations?
});
