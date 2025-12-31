import { Actor, log } from 'apify';
import { sleep } from 'crawlee';

import { Orchestrator } from './orchestrator/index.js';
import { TestActorRunner } from './test-actor-runner.js';
import { TestTaskRunner } from './test-task-runner.js';
import type { Input, Output } from './types.js';

await Actor.init();

const input = await Actor.getInput<Input>();
if (!input) {
    throw new Error('Input is required');
}

const {
    role,
    numberOfChildren = 3,
    childTaskId,
    childMemoryMbytes,
    orchestratorOptions,
    waitSeconds,
    childWaitSeconds,
} = input;

if (role === 'root') {
    const orchestrator = new Orchestrator(orchestratorOptions);
    const client = await orchestrator.apifyClient();

    let childrenTotal = 0;

    const runner = childTaskId
        ? new TestTaskRunner(client, childTaskId)
        : await TestActorRunner.new(client, { childWaitSeconds, childMemoryMbytes });

    await Promise.all(
        Array.from({ length: numberOfChildren }).map(async (_, index) => {
            const childNumber = index + 1;
            const run = await runner.call(childNumber);
            if (run) childrenTotal += await run.getTotalOutput();
        }),
    );

    await Actor.pushData<Output>({ randomNumber: childrenTotal });
} else if (role === 'child') {
    const randomNumber = Math.floor(Math.random() * 100) + 1;
    log.info(`Generated random number: ${randomNumber}`);
    await Actor.pushData<Output>({ randomNumber });
}

if (waitSeconds) {
    log.info(`Waiting for ${waitSeconds} seconds before finishing...`);
    await sleep(waitSeconds * 1000);
}

await Actor.exit();
