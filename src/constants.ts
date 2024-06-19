import { OrchestratorOptions } from './types.js';

export const MAIN_LOOP_INTERVAL_MS = 1000;

export const DEFAULT_ORCHESTRATOR_OPTIONS: OrchestratorOptions = {
    enableLogs: true,
    persistSupport: 'kvs',
    persistPrefix: 'ORCHESTRATOR-',
    abortAllRunsOnGracefulAbort: true,
};

export const APIFY_PAYLOAD_BYTES_LIMIT = 9437184;
