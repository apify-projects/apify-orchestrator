import { ActorRun } from 'apify';

import { ActorOptions } from './client.js';
import { Queue } from './utils/queue.js';

export type ActorInput = Record<string, unknown>

export interface RunRequest {
    runName: string
    actorId: string
    input?: ActorInput,
    options?: ActorOptions,
    apifyToken?: string
}

type RunCallback = (run: ActorRun | null) => void

interface RunRequestWithCallbacks extends RunRequest {
    onStart: RunCallback[]
}

export class RunRequestsManager {
    /**
     * Record of Apify tokens with their queue of run requests.
     * It is organized by token to quickly check if an account has enough memory available to run another Actor.
     * The empty string '' token represents the user running the Orchestrator.
     */
    private runQueues: Record<string, Queue<RunRequestWithCallbacks>> = {};

    get accountTokens() {
        return Object.keys(this.runQueues);
    }

    find(targetRunName: string) {
        for (const queue of Object.values(this.runQueues)) {
            const runRequest = queue.find(({ runName }) => runName === targetRunName);
            if (runRequest) { return runRequest; }
        }
        return undefined;
    }

    enqueue(runRequest: RunRequest, ...onStart: RunCallback[]) {
        const apifyToken = runRequest.apifyToken ?? '';
        if (!this.runQueues[apifyToken]) {
            this.runQueues[apifyToken] = new Queue<RunRequestWithCallbacks>();
        }
        this.runQueues[apifyToken].enqueue({ ...runRequest, onStart });
    }

    findRequestAndRegisterCallback(targetRunName: string, ...onStart: RunCallback[]) {
        const req = this.find(targetRunName);
        if (!req) { return false; }
        req.onStart.push(...onStart);
        return true;
    }

    length(apifyToken: string | undefined) {
        return this.runQueues[apifyToken ?? '']?.length ?? 0;
    }

    peek(apifyToken: string | undefined) {
        return this.runQueues[apifyToken ?? '']?.peek();
    }

    dequeue(apifyToken: string | undefined) {
        return this.runQueues[apifyToken ?? '']?.dequeue();
    }
}

export async function waitForRequest(runRequest: RunRequestWithCallbacks) {
    return new Promise<ActorRun | null>((resolve) => {
        runRequest.onStart.push(resolve);
    });
}
