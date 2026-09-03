import type { OrchestratorOptions, SplitRules } from './types.js';

export const MAIN_LOOP_INTERVAL_MS = 1_000;
export const MAIN_LOOP_COOLDOWN_MS = 10_000;

/**
 * How often to refresh the status of the Runs which are known to be active.
 *
 * This is only needed to keep the count of active Runs reasonably up to date when a concurrency limit is set,
 * so the interval is deliberately coarse: the limit is respected within roughly this margin.
 */
export const RUN_STATUS_POLL_INTERVAL_MS = 10_000;

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
