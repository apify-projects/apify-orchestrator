import { Actor, log } from 'apify';
import type { ActorCallOptions, ActorRun } from 'apify-client';
import { sleep } from 'crawlee';

import type { DatasetItem, ExtendedApifyClient } from './orchestrator/index.js';
import { Orchestrator } from './orchestrator/index.js';

let thisActorId: string | undefined;

await Actor.init();

interface Input {
    role: 'root' | 'child';
    numberOfChildren?: number;
    childMemoryMbytes?: number;
    childTaskId?: string;
    orchestratorOptions?: Record<string, unknown>;
    childWaitSeconds?: number;
}

interface Output extends DatasetItem {
    randomNumber: number;
}

const input = await Actor.getInput<Input>();
if (!input) {
    throw new Error('Input is required');
}

const { role, numberOfChildren = 3, childMemoryMbytes, orchestratorOptions, childWaitSeconds } = input;

if (role === 'root') {
    const orchestrator = new Orchestrator(orchestratorOptions);
    const client = await orchestrator.apifyClient();

    let randomTotal = 0;

    await Promise.all(
        Array.from({ length: numberOfChildren }).map(async (_, index) => {
            const childNumber = index + 1;
            const run = await callChild(client, childNumber);
            if (!run) return;
            randomTotal += await getRunTotalOutput(client, run, childNumber);
        }),
    );

    await Actor.pushData<Output>({ randomNumber: randomTotal });
} else {
    if (childWaitSeconds) {
        log.info(`Child actor waiting for ${childWaitSeconds} seconds before generating random number...`);
        await sleep(childWaitSeconds * 1000);
    }
    const randomNumber = Math.floor(Math.random() * 100) + 1;
    log.info(`Generated random number: ${randomNumber}`);
    await Actor.pushData<Output>({ randomNumber });
}

await Actor.exit();

async function callChild(client: ExtendedApifyClient, index: number): Promise<ActorRun | null> {
    if (input?.childTaskId) {
        const taskClient = client.task(input.childTaskId);
        try {
            return await taskClient.call(undefined, { runName: `child-task-${index}` });
        } catch (error) {
            log.exception(
                error as Error,
                `Error calling child task for child actor ${index}`,
                { taskId: input.childTaskId },
            );
            return null;
        }
    }
    thisActorId ??= await getActorId();
    const actorClient = client.actor(thisActorId);
    const childInput: Input = { role: 'child', childWaitSeconds };
    const childOptions: ActorCallOptions = { memory: childMemoryMbytes };
    try {
        return await actorClient.call(`child-${index}`, childInput, childOptions);
    } catch (error) {
        log.exception(
            error as Error,
            `Error calling child actor ${index}`,
            { actorId: thisActorId, input: childInput, options: childOptions },
        );
        return null;
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

async function getRunTotalOutput(client: ExtendedApifyClient, run: ActorRun, index: number): Promise<number> {
    let total = 0;
    try {
        const outputIterator = client.dataset<Output>(run.defaultDatasetId).iterate({ pageSize: 100 });
        for await (const item of outputIterator) {
            log.info(`Received random number from child ${index}: ${item.randomNumber}`);
            total += item.randomNumber;
        }
    } catch (error) {
        log.exception(
            error as Error,
            `Error retrieving output from child actor ${index}`,
            { datasetId: run.defaultDatasetId },
        );
    }
    return total;
}
