import { OrchestratorOptions } from './types.js';

export const MAIN_LOOP_INTERVAL_MS = 1_000;
export const MAIN_LOOP_COOLDOWN_MS = 10_000;

export const DEFAULT_ORCHESTRATOR_OPTIONS: OrchestratorOptions = {
    enableLogs: true,
    hideSensitiveInformation: true,
    persistenceSupport: 'none',
    persistencePrefix: 'ORCHESTRATOR-',
    abortAllRunsOnGracefulAbort: true,
};

export const APIFY_PAYLOAD_BYTES_LIMIT = 9_437_184;
