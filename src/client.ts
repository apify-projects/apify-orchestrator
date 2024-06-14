import { Actor, ApifyClient } from 'apify';

import { CustomLogger } from './logging.js';
import { RunRequest } from './run-request.js';
import { RunsTracker } from './tracking.js';

const getApifyClient = (token?: string) => (token ? new ApifyClient({ token }) : Actor.apifyClient);

// FIXME: type copied from SDK, except for `webhooks`.
// Correctly type this if this code is integrated into the SDK
export interface ActorOptions {
    build?: string;
    contentType?: string;
    memory?: number;
    timeout?: number;
    waitForFinish?: number;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    webhooks?: readonly any[];
    maxItems?: number;
}

export async function getDefaultRunOptions(
    logger: CustomLogger,
    actorId: string,
    apifyToken?: string,
) {
    const apifyClient = getApifyClient(apifyToken);

    const actor = await apifyClient.actor(actorId).get();

    if (!actor) {
        logger.warning('Cannot get Actor data while trying to read default options', { actorId });
        return undefined;
    }

    return actor.defaultRunOptions;
}

export async function getRun(tracker: RunsTracker, runName: string) {
    const runInfo = tracker.runs[runName];
    if (!runInfo) { return null; }
    return await getApifyClient(runInfo.apifyToken).run(runInfo.runId).get() ?? null;
}

export async function startAndTrackRun(logger: CustomLogger, tracker: RunsTracker, runRequest: RunRequest) {
    const { runName, actorId, input, options, apifyToken } = runRequest;
    const apifyClient = getApifyClient(apifyToken);

    // If the tracker has the runInfo, the Run was already started - maybe in a previous session.
    let runInfo = tracker.runs[runName];

    if (runInfo) {
        // Update the token, since it was not stored in the KeyValueStore
        tracker.refreshToken(runName, apifyToken);

        const run = await apifyClient.run(runInfo.runId).get();

        if (run) {
            // If we have the run object, just return it.
            logger.prfxInfo(runName, `Existing run found`, { url: runInfo.runUrl });
            return run;
        }
    }

    // Start a new Run and track it.
    const run = await apifyClient.actor(actorId).start(input, options);
    runInfo = await tracker.register(runName, run.id, run.status, apifyToken);
    logger.prfxInfo(runName, `Started Run`, { url: runInfo.runUrl });

    return run;
}

export async function waitAndTrackRun(logger: CustomLogger, tracker: RunsTracker, runName: string) {
    const runInfo = tracker.runs[runName];
    if (!runInfo) {
        logger.prfxWarn(runName, 'Tried to wait for a Run which was not found (maybe it was never enqueued/started?)');
        return null;
    }

    const apifyClient = getApifyClient(runInfo.apifyToken);

    logger.prfxInfo(runName, `Waiting for Run to finish`, { url: runInfo.runUrl });
    const run = await apifyClient.run(runInfo.runId).waitForFinish();
    await tracker.updateStatus(runName, run.status);
    if (run.status !== 'SUCCEEDED') {
        logger.prfxWarn(runName, 'Run failed', { status: run.status, url: runInfo.runUrl });
    } else {
        logger.prfxInfo(runName, `Run finished`, { status: run.status, url: runInfo.runUrl });
    }

    return run;
}

export async function abortAndTrackRun(logger: CustomLogger, tracker: RunsTracker, runName: string) {
    const runInfo = tracker.runs[runName];
    if (!runInfo) {
        logger.prfxWarn(runName, 'Tried to abort a Run which was not found in the tracker (maybe it was never started?)');
        return;
    }

    const apifyClient = getApifyClient(runInfo.apifyToken);

    await apifyClient.run(runInfo.runId).abort();
}
