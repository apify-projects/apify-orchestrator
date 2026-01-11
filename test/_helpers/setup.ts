import type { ExtApifyClientContext } from 'src/clients/apify-client.js';
import { ExtApifyClient } from 'src/clients/apify-client.js';
import { RunScheduler } from 'src/run-scheduler.js';
import { RunTracker } from 'src/run-tracker.js';

import { getTestContext, getTestOptions } from './context.js';

export async function setupTestApifyClient() {
    const options = getTestOptions();

    const globalContext = getTestContext(options);
    const { logger } = globalContext;

    const runTracker = await RunTracker.new(globalContext);
    const runScheduler = new RunScheduler(globalContext, {
        onRunStarted: () => {
            /* no-op */
        },
        retryOnInsufficientResources: false,
    });

    const clientContext: ExtApifyClientContext = { logger, runTracker, runScheduler };
    const apifyClient = new ExtApifyClient(clientContext, { clientName: 'test-client', ...options });

    return { apifyClient, runTracker, runScheduler };
}
