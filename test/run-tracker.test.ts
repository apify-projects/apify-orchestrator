import type { ActorRun } from 'apify-client';
import { RunTracker } from 'src/run-tracker.js';
import type { RunInfo } from 'src/types.js';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { getTestContext } from './_helpers/context.js';
import { createActorRunMock } from './_helpers/mocks.js';

describe('RunTracker', async () => {
    const context = getTestContext();

    const runMock = createActorRunMock();

    const runName = 'test-run-1';
    const runInfo = {
        runId: runMock.id,
        runUrl: `https://test.com/${runMock.id}`,
        status: runMock.status,
        startedAt: runMock.startedAt.toISOString(),
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
        const tracker = new RunTracker(context, initialTrackedRuns);

        expect(tracker.findRunByName(runName)).toEqual(runInfo);
    });

    it('initializes tracked runs to empty state if no runs are found', async () => {
        const emptyTrackedRuns = {
            current: {},
            failedHistory: {},
        };

        const tracker = new RunTracker(context, emptyTrackedRuns);

        expect(tracker.findRunByName(runName)).toBeUndefined();
    });

    it('tracks and retrieves current runs correctly', async () => {
        const expectedRunInfo: Partial<RunInfo> = {
            runId: runMock.id,
            status: runMock.status,
            startedAt: runMock.startedAt.toISOString(),
        };

        const emptyTrackedRuns = {
            current: {},
            failedHistory: {},
        };

        const tracker = new RunTracker(context, emptyTrackedRuns);

        tracker.updateRun(runName, runMock);

        const storedRun = tracker.findRunByName(runName);
        expect(storedRun).toEqual(expect.objectContaining(expectedRunInfo));

        const foundRunName = tracker.findRunName(runMock.id);
        expect(foundRunName).toBe(runName);
        expect(tracker.getCurrentRuns()).toEqual({ [runName]: expect.objectContaining(expectedRunInfo) });
    });

    it('calls the callback on updates', async () => {
        const onUpdateMock = vi.fn();
        const contextWithCallback = { ...context, options: { ...context.options, onUpdate: onUpdateMock } };

        const tracker = new RunTracker(contextWithCallback, initialTrackedRuns);

        expect(onUpdateMock).toHaveBeenCalledWith(initialTrackedRuns.current, undefined, undefined);

        tracker.updateRun('test-run-2', runMock);

        expect(onUpdateMock).toHaveBeenCalledWith(
            expect.objectContaining({
                [runName]: runInfo,
                'test-run-2': expect.objectContaining({
                    runId: runMock.id,
                    status: runMock.status,
                    startedAt: runMock.startedAt.toISOString(),
                }),
            }),
            'test-run-2',
            runMock,
        );
    });

    it('does not call the callback if there are no changes', async () => {
        const onUpdateMock = vi.fn();
        const contextWithCallback = { ...context, options: { ...context.options, onUpdate: onUpdateMock } };

        const emptyTrackedRuns = {
            current: {},
            failedHistory: {},
        };

        const tracker = new RunTracker(contextWithCallback, emptyTrackedRuns);

        expect(tracker.findRunByName(runName)).toBeUndefined();
        expect(onUpdateMock).toHaveBeenCalledTimes(1);

        tracker.updateRun('test-run-1', runMock);

        expect(onUpdateMock).toHaveBeenCalledTimes(2);

        tracker.updateRun('test-run-1', runMock); // same run data

        expect(onUpdateMock).toHaveBeenCalledTimes(2); // no changes, no new call
    });

    it('updates failed runs correctly', async () => {
        const failedRunMock = { id: runMock.id, status: 'FAILED', startedAt: new Date() } as ActorRun;

        const emptyTrackedRuns = {
            current: {},
            failedHistory: {},
        };

        const tracker = new RunTracker(context, emptyTrackedRuns);

        tracker.updateRun(runName, failedRunMock);
        const updatedRunInfo = tracker.findRunByName(runName);

        expect(updatedRunInfo.status).toBe('FAILED');
        expect(tracker.findRunByName(runName)).toEqual(
            expect.objectContaining({
                runId: runMock.id,
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
        const emptyTrackedRuns = {
            current: {},
            failedHistory: {},
        };

        const tracker = new RunTracker(context, emptyTrackedRuns);

        tracker.updateRun(runName, runMock); // first track the run
        tracker.updateRun(runName); // then declare it lost

        const lostRunInfo = tracker.findRunByName(runName);
        expect(lostRunInfo).toBeUndefined();

        // eslint-disable-next-line dot-notation
        expect(tracker['trackedRuns'].failedHistory).toEqual({
            [runName]: [
                expect.objectContaining({
                    runId: runMock.id,
                    status: 'LOST',
                }),
            ],
        });
    });
});
