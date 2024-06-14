import { ActorRun } from 'apify';

import { ActorOptions } from './client.js';
import { Queue } from './utils/queue.js';

export interface ActorParams {
    input?: unknown,
    options?: ActorOptions,
    apifyToken?: string
}

export interface RunRequest {
    runName: string
    actorId: string
    actorParams?: ActorParams
    onStart: ((run: ActorRun | null) => void)[]
}

export function createRequestsManager() {
    /**
     * Record of Apify tokens with their queue of run requests.
     * It is organized by token to quickly check if an account has enough memory available to run another Actor.
     * The empty string '' token represents the user running the Orchestrator.
     */
    const runQueues: Record<string, Queue<RunRequest>> = {};

    return {
        get accountTokens() {
            return Object.keys(runQueues);
        },

        find(targetRunName: string) {
            for (const queue of Object.values(runQueues)) {
                const runRequest = queue.find(({ runName }) => runName === targetRunName);
                if (runRequest) { return runRequest; }
            }
            return undefined;
        },

        enqueue(apifyToken: string | undefined, runRequest: RunRequest) {
            if (!runQueues[apifyToken ?? '']) {
                runQueues[apifyToken ?? ''] = new Queue<RunRequest>();
            }
            runQueues[apifyToken ?? ''].enqueue(runRequest);
        },

        length(apifyToken: string | undefined) {
            return runQueues[apifyToken ?? '']?.length ?? 0;
        },

        peek(apifyToken: string | undefined) {
            return runQueues[apifyToken ?? '']?.peek();
        },

        dequeue(apifyToken: string | undefined) {
            return runQueues[apifyToken ?? '']?.dequeue();
        },
    };
}
