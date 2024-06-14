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
    onStart: RunCallback[]
}

type RunCallback = (run: ActorRun | null) => void

export class RunRequestsManager {
    /**
     * Record of Apify tokens with their queue of run requests.
     * It is organized by token to quickly check if an account has enough memory available to run another Actor.
     * The empty string '' token represents the user running the Orchestrator.
     */
    private runQueues: Record<string, Queue<RunRequest>> = {};

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
        const apifyToken = runRequest.actorParams?.apifyToken ?? '';
        if (!this.runQueues[apifyToken]) {
            this.runQueues[apifyToken] = new Queue<RunRequest>();
        }
        this.runQueues[apifyToken].enqueue({ ...runRequest, onStart });
    }

    addStartCallback(targetRunName: string, ...onStart: RunCallback[]) {
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
