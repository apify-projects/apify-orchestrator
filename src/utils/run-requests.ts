import type { ActorStartOptions, Dictionary, TaskStartOptions } from 'apify-client';

import type { ActorRunRequest } from '../types.js';

export function generateRunRequests(
    namePrefix: string,
    inputChunks: Dictionary[],
    options?: ActorStartOptions | TaskStartOptions,
): ActorRunRequest[] {
    return Object.entries(inputChunks).map(([index, input]) => {
        const runName = generateRunName(namePrefix, index, inputChunks.length);
        return { runName, input, options };
    });
}

function generateRunName(namePrefix: string, iterationIndex: string, total: number): string {
    if (total > 1) {
        const index = Number.parseInt(iterationIndex, 10) + 1; // Convert to 1-based index
        return `${namePrefix}-${index}/${total}`;
    }
    return namePrefix;
}
