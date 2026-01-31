import type { ActorStartOptions, Dictionary, TaskStartOptions } from 'apify-client';

import type { ActorRunRequest } from '../types.js';

export function generateRunRequests(
    namePrefix: string,
    inputChunks: Dictionary[],
    options?: ActorStartOptions | TaskStartOptions,
): ActorRunRequest[] {
    return Object.entries(inputChunks).map(([index, input]) => {
        const runName = inputChunks.length > 1 ? `${namePrefix}-${index}/${inputChunks.length}` : namePrefix;
        return { runName, input, options };
    });
}
