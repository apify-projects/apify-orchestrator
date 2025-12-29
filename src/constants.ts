import type { OrchestratorOptions, SplitRules } from './types.js';

export const MAIN_LOOP_INTERVAL_MS = 1_000;
export const MAIN_LOOP_COOLDOWN_MS = 10_000;

export const DEFAULT_ORCHESTRATOR_OPTIONS: OrchestratorOptions = {
    enableLogs: true,
    hideSensitiveInformation: true,
    persistenceSupport: 'none',
    persistencePrefix: 'ORCHESTRATOR-',
    abortAllRunsOnGracefulAbort: true,
    retryOnInsufficientResources: true,
};

export const APIFY_PAYLOAD_BYTES_LIMIT = 9_437_184;

export const RUN_STATUSES = {
    RUN_STARTED: 'RUN_STARTED',
    ERROR: 'ERROR',
    /**
     * Returned when a run is about to be spawned on the platform
     */
    IN_PROGRESS: 'IN_PROGRESS',
} as const;

export const DEFAULT_SPLIT_RULES: SplitRules = {
    respectApifyMaxPayloadSize: true,
};
