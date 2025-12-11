import type { ActorRun } from 'apify-client';
import { RunTracker } from 'src/run-tracker.js';
import { buildLogger } from 'src/utils/logging.js';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { getTestOptions } from './_helpers/context.js';
import { actorRunMock, storageMock } from './_helpers/mocks.js';

describe('RunTracker', async () => {
    const logger = buildLogger(getTestOptions());
    const context = { logger, storage: storageMock };

    const runName = 'test-run-1';
    const runInfo = {
        runId: actorRunMock.id,
        runUrl: `https://test.com/${actorRunMock.id}`,
        status: actorRunMock.status,
        startedAt: actorRunMock.startedAt.toISOString(),
    };

    const initialTrackedRuns = {
        current: {
            [runName]: runInfo,
        },
        failedHistory: {},
    };

    afterEach(() => {
        vi.clearAllMocks();
    });

    it('initializes tracked runs from storage correctly', async () => {
        vi.mocked(storageMock.useState).mockResolvedValue(initialTrackedRuns);

        const tracker = await RunTracker.new(context, { storage: storageMock });

        expect(storageMock.useState).toHaveBeenCalled();
        expect(tracker.findRunByName(runName)).toEqual(runInfo);
    });

    it('initializes tracked runs to empty state if no runs are found', async () => {
        vi.mocked(storageMock.useState).mockImplementation(async (_key, defaultValue) => defaultValue);

        const tracker = await RunTracker.new(context, { storage: storageMock });

        expect(storageMock.useState).toHaveBeenCalled();
        expect(tracker.findRunByName(runName)).toBeUndefined();
    });

    it('uses the correct storage key', async () => {
        vi.mocked(storageMock.useState).mockImplementation(async (_key, defaultValue) => defaultValue);

        await RunTracker.new(context, { storage: storageMock });

        expect(storageMock.useState).toHaveBeenCalledWith(
            'RUNS',
            expect.objectContaining({
                current: {},
                failedHistory: {},
            }),
        );
    });

    it('uses the correct storage key with a prefix', async () => {
        vi.mocked(storageMock.useState).mockImplementation(async (_key, defaultValue) => defaultValue);

        await RunTracker.new(context, { storage: storageMock, storagePrefix: 'CUSTOM_PREFIX_' });

        expect(storageMock.useState).toHaveBeenCalledWith(
            'CUSTOM_PREFIX_RUNS',
            expect.objectContaining({
                current: {},
                failedHistory: {},
            }),
        );
    });

    it('tracks and retrieves current runs correctly', async () => {
        const tracker = await RunTracker.new(context);

        tracker.updateRun(runName, actorRunMock);

        const storedRun = tracker.findRunByName(runName);
        expect(storedRun).toEqual(
            expect.objectContaining({
                runId: actorRunMock.id,
                status: actorRunMock.status,
                startedAt: actorRunMock.startedAt.toISOString(),
            }),
        );

        const foundRunName = tracker.findRunName(actorRunMock.id);
        expect(foundRunName).toBe(runName);
        expect(tracker.getCurrentRunNames()).toEqual([runName]);
    });

    it('calls the callback on updates', async () => {
        vi.mocked(storageMock.useState).mockResolvedValue(initialTrackedRuns);
        const onUpdateMock = vi.fn();

        const tracker = await RunTracker.new(context, { storage: storageMock, onUpdate: onUpdateMock });

        expect(onUpdateMock).toHaveBeenCalledWith(initialTrackedRuns.current, undefined, undefined);

        tracker.updateRun('test-run-2', actorRunMock);

        expect(onUpdateMock).toHaveBeenCalledWith(
            expect.objectContaining({
                [runName]: runInfo,
                'test-run-2': expect.objectContaining({
                    runId: actorRunMock.id,
                    status: actorRunMock.status,
                    startedAt: actorRunMock.startedAt.toISOString(),
                }),
            }),
            'test-run-2',
            actorRunMock,
        );
    });

    it('does not call the callback if there are no changes', async () => {
        const onUpdateMock = vi.fn();

        const tracker = await RunTracker.new(context, { onUpdate: onUpdateMock });

        expect(tracker.findRunByName(runName)).toBeUndefined();
        expect(onUpdateMock).toHaveBeenCalledTimes(1);

        tracker.updateRun('test-run-1', actorRunMock);

        expect(onUpdateMock).toHaveBeenCalledTimes(2);

        tracker.updateRun('test-run-1', actorRunMock); // same run data

        expect(onUpdateMock).toHaveBeenCalledTimes(2); // no changes, no new call
    });

    it('updates failed runs correctly', async () => {
        const failedRunMock = { id: actorRunMock.id, status: 'FAILED', startedAt: new Date() } as ActorRun;

        const tracker = await RunTracker.new(context);

        const updatedRunInfo = tracker.updateRun(runName, failedRunMock);

        expect(updatedRunInfo.status).toBe('FAILED');
        expect(tracker.findRunByName(runName)).toEqual(
            expect.objectContaining({
                runId: actorRunMock.id,
                status: 'FAILED',
            }),
        );

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        expect((tracker as any).trackedRuns.failedHistory).toEqual({
            [runName]: [
                {
                    ...updatedRunInfo,
                    status: 'FAILED',
                },
            ],
        });
    });

    it('declares lost runs correctly', async () => {
        const tracker = await RunTracker.new(context);

        const updatedRunInfo = tracker.updateRun(runName, actorRunMock);

        tracker.declareLostRun(runName, 'Simulated loss');

        const lostRunInfo = tracker.findRunByName(runName);
        expect(lostRunInfo).toBeUndefined();

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        expect((tracker as any).trackedRuns.failedHistory).toEqual({
            [runName]: [
                {
                    ...updatedRunInfo,
                    status: 'LOST',
                },
            ],
        });
    });
});
