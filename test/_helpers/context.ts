import type { OrchestratorOptions } from 'src/types.js';
import type { GlobalContext } from 'src/utils/context.js';
import { buildLogger } from 'src/utils/logging.js';
import { buildStorage } from 'src/utils/storage.js';

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

export function getTestGlobalContext(options: OrchestratorOptions): GlobalContext {
    const logger = buildLogger(options);
    const storage = buildStorage(logger, options);
    return { logger, storage };
}
