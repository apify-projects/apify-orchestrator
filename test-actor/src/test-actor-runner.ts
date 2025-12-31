import { Actor, log } from 'apify';
import type { ActorCallOptions } from 'apify-client';

import type { ExtendedActorClient, ExtendedApifyClient } from './orchestrator/types.js';
import { TestRun } from './test-run.js';
import type { Input } from './types.js';

export interface TestActorRunnerOptions {
    childWaitSeconds?: number;
    childMemoryMbytes?: number;
}

export class TestActorRunner {
    private readonly actorClient: ExtendedActorClient;

    private constructor(
        private readonly apifyClient: ExtendedApifyClient,
        private readonly actorId: string,
        private readonly options: TestActorRunnerOptions,
    ) {
        this.actorClient = apifyClient.actor('');
    }

    static async new(client: ExtendedApifyClient, options: TestActorRunnerOptions): Promise<TestActorRunner> {
        const actorId = await getActorId();
        return new TestActorRunner(client, actorId, options);
    }

    async call(index: number): Promise<TestRun | null> {
        const childInput: Input = { role: 'child', waitSeconds: this.options.childWaitSeconds };
        const childOptions: ActorCallOptions = { memory: this.options.childMemoryMbytes };
        try {
            const run = await this.actorClient.call(`child-${index}`, childInput, childOptions);
            return new TestRun(this.apifyClient, run, index);
        } catch (error) {
            log.exception(error as Error, `Error calling child actor ${index}`, {
                actorId: this.actorId,
                input: childInput,
                options: childOptions,
            });
            return null;
        }
    }
}

async function getActorId(): Promise<string> {
    if (Actor.isAtHome()) {
        const { actorId } = Actor.getEnv();
        if (!actorId) throw new Error('Actor ID is not defined');
        return actorId;
    }
    const { userId } = Actor.getEnv();
    if (!userId) throw new Error('User ID is not defined');
    const user = Actor.apifyClient.user(userId);
    const { username } = await user.get();
    return `${username}/test-apify-orchestrator`;
}
