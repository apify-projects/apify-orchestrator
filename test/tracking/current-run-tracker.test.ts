import { CurrentRunTracker } from 'src/tracking/current-run-tracker.js';
import type { RunInfo } from 'src/types.js';
import { getTestGlobalContext, getTestOptions } from 'test/_helpers/context.js';
import { actorRunMock } from 'test/_helpers/mocks.js';
import { describe, expect, it, vi } from 'vitest';

describe('CurrentRunTracker', () => {
    const options = getTestOptions();
    const context = getTestGlobalContext(options);

    afterEach(() => {
        vi.clearAllMocks();
    });

    it('tracks and retrieves runs correctly', async () => {
        const currentRunTracker = new CurrentRunTracker(context, {});

        const runName = 'test-run-1';

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
    });

    it('calls the callback on updates', async () => {
        const initialRuns = {
            'test-run-1': {
                runId: 'test-run-1',
                runUrl: 'https://test.com/test-run-1',
                status: 'SUCCEEDED',
                startedAt: new Date().toISOString(),
            },
        };

        const onUpdateMock = vi.fn();

        const currentRunTracker = new CurrentRunTracker(context, initialRuns, onUpdateMock);

        expect(onUpdateMock).toHaveBeenCalledWith(initialRuns, undefined, undefined);

        currentRunTracker.addOrUpdateRun('test-run-2', actorRunMock);

        expect(onUpdateMock).toHaveBeenCalledWith(
            expect.objectContaining({
                'test-run-1': initialRuns['test-run-1'],
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

    describe('hasRunChanged', () => {
        it('returns true for a new run', async () => {
            const currentRunTracker = new CurrentRunTracker(context, {});
            const runName = 'test-run-1';
            const runInfo: RunInfo = {
                runId: actorRunMock.id,
                runUrl: `https://test.com/${actorRunMock.id}`,
                status: actorRunMock.status,
                startedAt: actorRunMock.startedAt.toISOString(),
            };
            const changed = currentRunTracker.hasRunChanged(runName, runInfo);
            expect(changed).toBe(true);
        });

        it('returns false for an unchanged run', async () => {
            const currentRunTracker = new CurrentRunTracker(context, {});
            const runName = 'test-run-1';
            const runInfo: RunInfo = {
                runId: actorRunMock.id,
                runUrl: `https://test.com/${actorRunMock.id}`,
                status: actorRunMock.status,
                startedAt: actorRunMock.startedAt.toISOString(),
            };
            currentRunTracker.addOrUpdateRun(runName, actorRunMock);
            const changed = currentRunTracker.hasRunChanged(runName, runInfo);
            expect(changed).toBe(false);
        });
    });

    describe('findAndDeleteRun', () => {
        it('deletes an existing run', async () => {
            const currentRunTracker = new CurrentRunTracker(context, {});
            const runName = 'test-run-1';
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
