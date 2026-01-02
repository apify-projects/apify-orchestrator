import { Actor, log } from 'apify';
import { sleep } from 'crawlee';

import { runEndToEndTests } from './e2e-test.js';
import { Orchestrator } from './orchestrator/index.js';
import { handleResurrectionTest } from './resurrection-test.js';
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
    numberToOutput,
} = input;

if (role === 'root') {
    log.info('Starting root orchestrator run');
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

    await Actor.pushData<Output>({ value: childrenTotal });
} else if (role === 'child') {
    log.info('Generating output in child run');
    const outputValue = numberToOutput ?? Math.floor(Math.random() * 100) + 1;
    log.info(`Output value: ${outputValue}`);
    await Actor.pushData<Output>({ value: outputValue });
} else if (role === 'e2e-test') {
    log.info('Starting end-to-end tests');
    const output = await runEndToEndTests();
    await Actor.pushData(Object.entries(output).map(([testName, result]) => ({ testName, ...result })));
    if (Object.values(output).some((res) => !res.success)) {
        await Actor.fail('Some end-to-end tests failed');
    }
} else if (role === 'resurrection-test') {
    log.info('Starting resurrection test');
    await handleResurrectionTest(orchestratorOptions);
}

if (waitSeconds) {
    log.info(`Waiting for ${waitSeconds} seconds before finishing...`);
    await sleep(waitSeconds * 1000);
}

await Actor.exit();
