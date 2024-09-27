/**
 * This is temporarily a "copy-paste" kind of library.
 * Maybe, someday it will become a proper library or part of the SDK, who knows?
*/

import { ExtApifyClient } from './clients/apify-client.js';
import { DEFAULT_ORCHESTRATOR_OPTIONS } from './constants.js';
import { RunsTracker } from './tracker.js';
import {
    ApifyOrchestrator,
    OrchestratorOptions,
    ScheduledApifyClient,
    ScheduledClientOptions,
} from './types.js';
import { CustomLogger } from './utils/logging.js';

export const version = '0.3.0';

export * from './types.js';

// Use a singleton counter shared among all Orchestrator instances.
let clientsCounter = 0;

export class Orchestrator implements ApifyOrchestrator {
    protected options: OrchestratorOptions;
    protected customLogger: CustomLogger;

    constructor(options: Partial<OrchestratorOptions> = {}) {
        this.options = { ...DEFAULT_ORCHESTRATOR_OPTIONS, ...options };
        this.customLogger = new CustomLogger(this.options.enableLogs, this.options.hideSensibleInformation);
    }

    async apifyClient(options: ScheduledClientOptions = {}): Promise<ScheduledApifyClient> {
        const { name, ...apifyClientOptions } = options;

        clientsCounter++;

        const enableFailedRunsHistory = !this.options.hideSensibleInformation;
        const runsTracker = new RunsTracker(
            this.customLogger,
            enableFailedRunsHistory,
            this.options.onUpdate,
        );
        const clientName = name ?? `CLIENT-${clientsCounter}`;
        await runsTracker.init(
            this.options.persistSupport,
            `${this.options.persistPrefix}${clientName}-`,
            this.options.persistEncryptionKey,
        );

        const client = new ExtApifyClient(
            clientName,
            this.customLogger,
            runsTracker,
            this.options.fixedInput,
            this.options.abortAllRunsOnGracefulAbort,
            this.options.hideSensibleInformation,
            !!this.options.onUpdate,
            apifyClientOptions,
        );
        client.startScheduler();

        return client;
    }
}
