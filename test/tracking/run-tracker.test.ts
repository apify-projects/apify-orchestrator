import type { ActorRun } from 'apify-client';
import { CurrentRunTracker } from 'src/tracking/current-run-tracker.js';
import type { FailedRunHistoryTracker } from 'src/tracking/failed-run-history-tracker.js';
import { RunTracker } from 'src/tracking/run-tracker.js';
import { getTestGlobalContext, getTestOptions } from 'test/_helpers/context.js';
import { actorRunMock } from 'test/_helpers/mocks.js';
import { describe, expect, it, vi } from 'vitest';

describe('RunTracker', async () => {
    const options = getTestOptions();
    const context = getTestGlobalContext(options);

    const currentRunTracker = new CurrentRunTracker(context, {});
    const failedRunHistoryTrackerMock = {
        addOrUpdateFailedRun: vi.fn(),
    } as unknown as FailedRunHistoryTracker;

    const runTracker = new RunTracker(context, currentRunTracker, failedRunHistoryTrackerMock);

    const runName = 'test-run-1';

    const runInfo = runTracker.updateRun(runName, actorRunMock);

    it('tracks current runs correctly', async () => {
        expect(runInfo).toEqual(
            expect.objectContaining({
                runId: actorRunMock.id,
                status: actorRunMock.status,
                startedAt: actorRunMock.startedAt.toISOString(),
            }),
        );
        expect(failedRunHistoryTrackerMock.addOrUpdateFailedRun).not.toHaveBeenCalled();

        const existingRunInfo = runTracker.findRunByName(runName);
        expect(existingRunInfo).toEqual(runInfo);

        const foundRunName = runTracker.findRunName(actorRunMock.id);
        expect(foundRunName).toBe(runName);
    });

    it('updates runs correctly', async () => {
        const updatedRunMock = { id: actorRunMock.id, status: 'RUNNING', startedAt: new Date() } as ActorRun;
        const updatedRunInfo = runTracker.updateRun(runName, updatedRunMock);

        expect(updatedRunInfo.status).toBe('RUNNING');
        expect(failedRunHistoryTrackerMock.addOrUpdateFailedRun).not.toHaveBeenCalled();
    });

    it('updates failed runs correctly', async () => {
        const failedRunMock = { id: actorRunMock.id, status: 'FAILED', startedAt: new Date() } as ActorRun;
        const updatedRunInfo = runTracker.updateRun(runName, failedRunMock);

        expect(updatedRunInfo.status).toBe('FAILED');
        expect(failedRunHistoryTrackerMock.addOrUpdateFailedRun).toHaveBeenCalledWith(
            runName,
            expect.objectContaining({
                runId: actorRunMock.id,
                status: 'FAILED',
            }),
        );
    });

    it('declares lost runs correctly', async () => {
        runTracker.declareLostRun(runName, 'Simulated loss');
        const lostRunInfo = runTracker.findRunByName(runName);
        expect(lostRunInfo).toBeUndefined();
        expect(failedRunHistoryTrackerMock.addOrUpdateFailedRun).toHaveBeenCalledWith(
            runName,
            expect.objectContaining({
                runId: actorRunMock.id,
                status: 'LOST',
            }),
        );
    });
});
