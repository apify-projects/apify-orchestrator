import type { OrchestratorOptions, SplitRules } from './types.js';

export const MAIN_LOOP_INTERVAL_MS = 1_000;
export const MAIN_LOOP_COOLDOWN_MS = 10_000;

/**
 * How often to look for active Runs which are not being watched yet.
 *
 * A scan makes no API calls: it only reads the Runs which are already tracked, so it can be frequent.
 */
export const RUN_WATCH_INTERVAL_MS = 10_000;

/**
 * How long a single request watching a Run may wait for it to finish.
 *
 * The API keeps the request open until the Run finishes or this time elapses, whichever comes first,
 * so watching a Run costs about one request per minute. 60 seconds is the maximum accepted by the API.
 */
export const RUN_WATCH_SEGMENT_SECS = 60;

export const DEFAULT_ORCHESTRATOR_OPTIONS: OrchestratorOptions = {
    enableLogs: true,
    hideSensitiveInformation: true,
    persistenceSupport: 'none',
    persistencePrefix: 'ORCHESTRATOR-',
    abortAllRunsOnGracefulAbort: true,
    retryOnInsufficientResources: true,
};

export const APIFY_PAYLOAD_BYTES_LIMIT = 9_437_184;

export const DEFAULT_SPLIT_RULES: SplitRules = {
    respectApifyMaxPayloadSize: true,
};
