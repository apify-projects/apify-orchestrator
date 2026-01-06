import type { OrchestratorOptions } from 'src/types.js';
import type { OrchestratorContext } from 'src/utils/context.js';
import { buildLogger } from 'src/utils/logging.js';

const DEFAULT_TEST_OPTIONS: OrchestratorOptions = {
    enableLogs: false,
    hideSensitiveInformation: false,
    persistenceSupport: 'none',
    persistencePrefix: 'TEST-',
    abortAllRunsOnGracefulAbort: true,
    retryOnInsufficientResources: true,
};

export function getTestOptions(overrides?: Partial<OrchestratorOptions>): OrchestratorOptions {
    return { ...DEFAULT_TEST_OPTIONS, ...overrides };
}

export function getTestContext(options: OrchestratorOptions): OrchestratorContext {
    const logger = buildLogger(options);
    return { logger };
}
