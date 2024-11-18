import { Actor, ActorRun } from 'apify';
import { RunsTracker } from 'src/tracker.js';
import { openEncryptedKeyValueStore } from 'src/utils/key-value-store.js';
import { CustomLogger } from 'src/utils/logging.js';

describe('RunsTracker', () => {
    const logger = new CustomLogger(false, false);
    const prefix = 'TEST-';
    const secret = 'test-secret';

    const mockDate = new Date('2024-09-11T06:00:00.000Z');

    const run1Name = 'test-run-1';
    const run1 = {
        id: 'test-id-1',
        status: 'READY',
        defaultDatasetId: 'test-dataset-id-1',
        startedAt: mockDate,
    } as ActorRun;
    const run2Name = 'test-run-2';
    const run2 = {
        id: 'test-id-2',
        status: 'SUCCEEDED',
        defaultDatasetId: 'test-dataset-id-2',
        startedAt: mockDate,
    } as ActorRun;

    afterEach(async () => {
        vi.clearAllMocks();
        await Actor.setValue(`${prefix}RUNS`, null);
        await Actor.setValue(`${prefix}FAILED_RUNS`, null);
    });

    it('inits correctly', async () => {
        const openKeyValueStoreSpy = vi.spyOn(Actor, 'openKeyValueStore');

        const tracker = new RunsTracker(logger, false);
        expect(openKeyValueStoreSpy).not.toHaveBeenCalled();

        await tracker.init('none', prefix);
        expect(openKeyValueStoreSpy).not.toHaveBeenCalled();

        await tracker.init('kvs', prefix);
        expect(openKeyValueStoreSpy).toHaveBeenCalledTimes(1);
        expect(await Actor.getValue(`${prefix}RUNS`)).toEqual({});
        expect(await Actor.getValue(`${prefix}FAILED_RUNS`)).toEqual(null);

        await tracker.init('kvs', prefix, secret);
        expect(openKeyValueStoreSpy).toHaveBeenCalledTimes(2);
        expect(await Actor.getValue(`${prefix}RUNS`)).not.toEqual({});
        expect(await Actor.getValue(`${prefix}FAILED_RUNS`)).toEqual(null);

        const encryptedKVS = await openEncryptedKeyValueStore(secret);
        expect(await encryptedKVS.getValue(`${prefix}RUNS`)).toEqual({});
    });

    it('inits correctly after a resurrection', async () => {
        const tracker = new RunsTracker(logger, false);

        const mockRuns = {
            [run1Name]: {
                runId: run1.id,
                runUrl: `https://console.apify.com/actors/runs/${run1.id}`,
                status: 'RUNNING',
                startedAt: mockDate.toISOString(),
            },
            [run2Name]: {
                runId: run2.id,
                runUrl: `https://console.apify.com/actors/runs/${run2.id}`,
                status: 'SUCCEEDED',
                startedAt: mockDate.toISOString(),
            },
        };

        await Actor.setValue(`${prefix}RUNS`, mockRuns);

        await tracker.init('kvs', prefix);
        expect(tracker.currentRuns).toEqual(mockRuns);
    });

    it('registers and updates runs correctly', async () => {
        const tracker = new RunsTracker(logger, false);

        await tracker.init('kvs', prefix);

        expect(tracker.currentRuns).toEqual({});

        await tracker.updateRun(run1Name, run1);
        expect(tracker.currentRuns).toEqual({
            [run1Name]: {
                runId: run1.id,
                runUrl: `https://console.apify.com/actors/runs/${run1.id}`,
                status: 'READY',
                startedAt: mockDate.toISOString(),
            },
        });

        await tracker.updateRun(run1Name, { ...run1, status: 'RUNNING' });
        expect(tracker.currentRuns).toEqual({
            [run1Name]: {
                runId: run1.id,
                runUrl: `https://console.apify.com/actors/runs/${run1.id}`,
                status: 'RUNNING',
                startedAt: mockDate.toISOString(),
            },
        });

        await tracker.updateRun(run2Name, run2);
        expect(tracker.currentRuns).toEqual({
            [run1Name]: {
                runId: run1.id,
                runUrl: `https://console.apify.com/actors/runs/${run1.id}`,
                status: 'RUNNING',
                startedAt: mockDate.toISOString(),
            },
            [run2Name]: {
                runId: run2.id,
                runUrl: `https://console.apify.com/actors/runs/${run2.id}`,
                status: 'SUCCEEDED',
                startedAt: mockDate.toISOString(),
            },
        });
        expect(tracker.currentRuns).toEqual(await Actor.getValue(`${prefix}RUNS`));
    });

    it('calls the callback upon update', async () => {
        const mockCallback = vi.fn();
        const tracker = new RunsTracker(logger, false, mockCallback);

        await Actor.setValue(`${prefix}RUNS`, {
            [run1Name]: {
                runId: run1.id,
                runUrl: `https://console.apify.com/actors/runs/${run1.id}`,
                status: 'READY',
                startedAt: mockDate.toISOString(),
            },
        });

        // The first update happens after the initialization and report the content fetched from KVS.
        await tracker.init('kvs', prefix);
        expect(mockCallback).toHaveBeenCalledTimes(1);
        expect(mockCallback).toHaveBeenLastCalledWith({
            [run1Name]: {
                runId: run1.id,
                runUrl: `https://console.apify.com/actors/runs/${run1.id}`,
                status: 'READY',
                startedAt: mockDate.toISOString(),
            },
        }, undefined);

        await tracker.updateRun(run2Name, run2);
        expect(mockCallback).toHaveBeenCalledTimes(2);
        expect(mockCallback).toHaveBeenLastCalledWith({
            [run1Name]: {
                runId: run1.id,
                runUrl: `https://console.apify.com/actors/runs/${run1.id}`,
                status: 'READY',
                startedAt: mockDate.toISOString(),
            },
            [run2Name]: {
                runId: run2.id,
                runUrl: `https://console.apify.com/actors/runs/${run2.id}`,
                status: 'SUCCEEDED',
                startedAt: mockDate.toISOString(),
            },
        }, run2);
    });

    it('allows to query runs', async () => {
        const tracker = new RunsTracker(logger, false);

        await tracker.updateRun(run1Name, run1);
        await tracker.updateRun(run2Name, run2);

        expect(tracker.currentRuns).toEqual({
            [run1Name]: {
                runId: run1.id,
                runUrl: `https://console.apify.com/actors/runs/${run1.id}`,
                status: 'READY',
                startedAt: mockDate.toISOString(),
            },
            [run2Name]: {
                runId: run2.id,
                runUrl: `https://console.apify.com/actors/runs/${run2.id}`,
                status: 'SUCCEEDED',
                startedAt: mockDate.toISOString(),
            },
        });
        expect(tracker.findRunByName(run1Name)).toEqual({
            runId: run1.id,
            runUrl: `https://console.apify.com/actors/runs/${run1.id}`,
            status: 'READY',
            startedAt: mockDate.toISOString(),
        });
        expect(tracker.findRunName(run2.id)).toEqual(run2Name);
    });

    it('works correctly with failed history enabled', async () => {
        const openKeyValueStoreSpy = vi.spyOn(Actor, 'openKeyValueStore');

        const tracker = new RunsTracker(logger, true);
        expect(openKeyValueStoreSpy).not.toHaveBeenCalled();

        await tracker.init('kvs', prefix);
        expect(openKeyValueStoreSpy).toHaveBeenCalledTimes(2);
        expect(await Actor.getValue(`${prefix}RUNS`)).toEqual({});
        expect(await Actor.getValue(`${prefix}FAILED_RUNS`)).toEqual({});

        await tracker.updateRun(run1Name, { ...run1, status: 'ABORTED' });
        expect(await Actor.getValue(`${prefix}FAILED_RUNS`)).toEqual({
            [run1Name]: [
                {
                    runId: run1.id,
                    runUrl: `https://console.apify.com/actors/runs/${run1.id}`,
                    status: 'ABORTED',
                    startedAt: mockDate.toISOString(),
                },
            ],
        });

        await tracker.updateRun(run2Name, run2);
        await tracker.declareLostRun(run2Name);
        expect(await Actor.getValue(`${prefix}FAILED_RUNS`)).toEqual({
            [run1Name]: [
                {
                    runId: run1.id,
                    runUrl: `https://console.apify.com/actors/runs/${run1.id}`,
                    status: 'ABORTED',
                    startedAt: mockDate.toISOString(),
                },
            ],
            [run2Name]: [
                {
                    runId: run2.id,
                    runUrl: `https://console.apify.com/actors/runs/${run2.id}`,
                    status: 'LOST',
                    startedAt: mockDate.toISOString(),
                },
            ],
        });
    });
});
