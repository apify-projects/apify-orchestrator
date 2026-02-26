import type { Dictionary } from '@crawlee/types';

import { DEFAULT_SPLIT_RULES } from '../constants.js';
import type { RunStartOptions } from '../entities/run-source.js';
import type { ActorRunRequest, OrchestratorOptions, SplitRules } from '../types.js';
import { generateInputChunks } from '../utils/bytes.js';
import { buildLogger, type Logger } from '../utils/logging.js';
import { generateRunRequests } from '../utils/run-requests.js';

export interface GenerateRunRequestsOptions<T> {
    namePrefix: string;
    sources: T[];
    inputGenerator: (chunk: T[]) => Dictionary;
    overrideSplitRules?: Partial<SplitRules>;
    options?: RunStartOptions;
}

/**
 * Represents the context available to all orchestrator components.
 */
export interface OrchestratorContext {
    options: OrchestratorOptions;
    logger: Logger;

    generateRunRequests<T>(options: GenerateRunRequestsOptions<T>): ActorRunRequest[];
}

export function generateOrchestratorContext(orchestratorOptions: OrchestratorOptions): OrchestratorContext {
    // Using an object instead of a class to allow extending the context more easily.
    return {
        options: orchestratorOptions,
        logger: buildLogger(orchestratorOptions),

        generateRunRequests<T>({
            namePrefix,
            sources,
            inputGenerator,
            overrideSplitRules = {},
            options,
        }: GenerateRunRequestsOptions<T>): ActorRunRequest[] {
            const splitRules = { ...DEFAULT_SPLIT_RULES, ...overrideSplitRules };
            const inputChunks = generateInputChunks(
                sources,
                inputGenerator,
                splitRules,
                orchestratorOptions.fixedInput,
            );
            return generateRunRequests(namePrefix, inputChunks, options);
        },
    };
}
