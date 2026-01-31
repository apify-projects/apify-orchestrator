import type { ClientContext } from 'src/context/client-context.js';
import { generateClientContext } from 'src/context/client-context.js';
import type { OrchestratorContext } from 'src/context/orchestrator-context.js';
import { generateOrchestratorContext } from 'src/context/orchestrator-context.js';
import type { OrchestratorOptions } from 'src/types.js';

const DEFAULT_TEST_OPTIONS: OrchestratorOptions = {
    enableLogs: false,
    hideSensitiveInformation: false,
    persistenceSupport: 'none',
    persistencePrefix: 'TEST-',
    abortAllRunsOnGracefulAbort: false,
    retryOnInsufficientResources: false,
};

export function getTestOptions(overrides?: Partial<OrchestratorOptions>): OrchestratorOptions {
    return { ...DEFAULT_TEST_OPTIONS, ...overrides };
}

export function getTestContext(overrideOptions?: Partial<OrchestratorOptions>): OrchestratorContext {
    const options = getTestOptions(overrideOptions);
    return generateOrchestratorContext(options);
}

export function getClientContext(overrideOptions?: Partial<OrchestratorOptions>): ClientContext {
    const orchestratorContext = getTestContext(overrideOptions);

    // Create empty tracked runs for testing
    const trackedRuns = {
        current: {},
        failedHistory: {},
    };

    return generateClientContext(orchestratorContext, trackedRuns);
}
