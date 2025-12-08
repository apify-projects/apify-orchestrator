import { CurrentRunTracker } from 'src/tracking/current-run-tracker.js';
import type { RunInfo } from 'src/types.js';
import { getTestGlobalContext, getTestOptions } from 'test/_helpers/context.js';
import { actorRunMock } from 'test/_helpers/mocks.js';
import { describe, expect, it, vi } from 'vitest';

describe('CurrentRunTracker', () => {
    const options = getTestOptions();
    const context = getTestGlobalContext(options);

    const runName = 'test-run-1';
    const runInfo: RunInfo = {
        runId: actorRunMock.id,
        runUrl: `https://test.com/${actorRunMock.id}`,
        status: actorRunMock.status,
        startedAt: actorRunMock.startedAt.toISOString(),
    };

    afterEach(() => {
        vi.clearAllMocks();
    });

    it('tracks and retrieves runs correctly', async () => {
        const currentRunTracker = new CurrentRunTracker(context, {});

        currentRunTracker.addOrUpdateRun(runName, actorRunMock);

        const storedRun = currentRunTracker.findRunByName(runName);
        expect(storedRun).toEqual(
            expect.objectContaining({
                runId: actorRunMock.id,
                status: actorRunMock.status,
                startedAt: actorRunMock.startedAt.toISOString(),
            }),
        );

        const foundRunName = currentRunTracker.findRunName(actorRunMock.id);
        expect(foundRunName).toBe(runName);
        expect(currentRunTracker.getCurrentRunNames()).toEqual([runName]);
    });

    it('calls the callback on updates', async () => {
        const initialRuns = { [runName]: runInfo };
        const onUpdateMock = vi.fn();
        const currentRunTracker = new CurrentRunTracker(context, initialRuns, onUpdateMock);

        expect(onUpdateMock).toHaveBeenCalledWith(initialRuns, undefined, undefined);

        currentRunTracker.addOrUpdateRun('test-run-2', actorRunMock);

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
        const currentRunTracker = new CurrentRunTracker(context, {}, onUpdateMock);

        expect(onUpdateMock).toHaveBeenCalledTimes(1);

        currentRunTracker.addOrUpdateRun('test-run-1', actorRunMock);

        expect(onUpdateMock).toHaveBeenCalledTimes(2);

        currentRunTracker.addOrUpdateRun('test-run-1', actorRunMock); // same run data

        expect(onUpdateMock).toHaveBeenCalledTimes(2); // no changes, no new call
    });

    describe('findAndDeleteRun', () => {
        it('deletes an existing run', async () => {
            const currentRunTracker = new CurrentRunTracker(context, {});
            currentRunTracker.addOrUpdateRun(runName, actorRunMock);
            const deletedRun = currentRunTracker.findAndDeleteRun(runName);
            expect(deletedRun).toEqual(
                expect.objectContaining({
                    runId: actorRunMock.id,
                    status: actorRunMock.status,
                    startedAt: actorRunMock.startedAt.toISOString(),
                }),
            );
            const shouldBeUndefined = currentRunTracker.findRunByName(runName);
            expect(shouldBeUndefined).toBeUndefined();
        });

        it('returns undefined for a non-existing run', async () => {
            const currentRunTracker = new CurrentRunTracker(context, {});
            const deletedRun = currentRunTracker.findAndDeleteRun('non-existing-run');
            expect(deletedRun).toBeUndefined();
        });
    });
});
