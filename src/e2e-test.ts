// This is the main entry point for end-to-end tests: it is an Actor that calls itself recursively through the Orchestrator.
// Depending on the role, it performs different operations.
// The root Run has the role 'e2e-test', and can spawn other Runs with different roles.

import { Actor, log } from 'apify';

import { handleResurrectionTest } from './__e2e__/resurrection-test.js';
import { runEndToEndTestSuite } from './__e2e__/test-suite.js';
import type { Input, Output } from './__e2e__/types.js';
import { sleep } from './__e2e__/utils.js';

const PUSH_INTERVAL_SECONDS = 1;

await Actor.init();

const input = await Actor.getInput<Input>();
if (!input) {
    throw new Error('Input is required');
}

const { role, orchestratorOptions, waitSeconds, numberToOutput, itemsToOutput } = input;

if (role === 'e2e-test') {
    log.info('Starting end-to-end tests');
    const output = await runEndToEndTestSuite();
    await Actor.pushData(Object.entries(output).map(([testName, result]) => ({ testName, ...result })));
    if (Object.values(output).some((res) => !res.success)) {
        await Actor.fail('Some end-to-end tests failed');
    }
} else if (role === 'resurrection-test') {
    log.info('Starting resurrection test');
    await handleResurrectionTest(orchestratorOptions);
} else if (role === 'child') {
    log.info('Generating output in child run');
    const outputValue = numberToOutput ?? Math.floor(Math.random() * 100) + 1;
    const itemsCount = itemsToOutput ?? 1;
    log.info(`Output value: ${outputValue}, items to push: ${itemsCount}`);
    // Push the items one at a time, to let the parent Run read them greedily as they become available.
    for (let index = 0; index < itemsCount; index++) {
        if (index > 0) {
            await sleep(PUSH_INTERVAL_SECONDS);
        }
        await Actor.pushData<Output>({ value: outputValue });
    }
}

if (waitSeconds) {
    log.info(`Waiting for ${waitSeconds} seconds before finishing...`);
    await sleep(waitSeconds);
}

await Actor.exit();
