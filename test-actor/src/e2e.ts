import { log } from 'apify';

import {
    generateActorTestRunner,
    getOrchestratorAndClient,
    getOrchestratorTrackedValue,
    testLog,
} from './e2e-utils.js';
import type { TrackedRuns } from './orchestrator/run-tracker.js';
import { TestTransientTaskRunner } from './test-transient-task-runner.js';

export interface TestResult {
    success: boolean;
    details?: string;
}

export type EndToEndTestOutput = { [testName: string]: TestResult };

export async function runEndToEndTests(): Promise<EndToEndTestOutput> {
    const tests = [
        childRunWithoutPersistence,
        childRunWithPlainPersistence,
        childRunWithEncryptedPersistence,
        childRunFromTask,
    ];

    const output: EndToEndTestOutput = {};

    for (const test of tests) {
        try {
            testLog(test.name).info('Starting test');
            const result = await test();
            testLog(test.name).info('Test finished', result);
            output[test.name] = result;
        } catch (err) {
            log.exception(err as Error, 'Error running end-to-end test', { test: test.name });
        }
    }

    return output;
}

async function childRunWithoutPersistence(): Promise<TestResult> {
    const { client } = await getOrchestratorAndClient({
        persistenceSupport: 'none',
        hideSensitiveInformation: false,
    });

    const runner = await generateActorTestRunner(client);

    const [run1, run2, run3] = await Promise.all(
        Array.from({ length: 3 }).map(async (_, index) => {
            const childNumber = index + 1;
            return runner.call(childNumber, childNumber * 10);
        }),
    );

    if (!run1 || !run2 || !run3) {
        return { success: false, details: 'One of the runs was not started successfully.' };
    }

    const output1 = await run1.getTotalOutput();
    const output2 = await run2.getTotalOutput();
    const output3 = await run3.getTotalOutput();

    if (output1 !== 10 || output2 !== 20 || output3 !== 30) {
        return { success: false, details: `Unexpected outputs: ${output1}, ${output2}, ${output3}` };
    }

    return { success: true };
}

async function childRunWithPlainPersistence(): Promise<TestResult> {
    const { client, testIndex } = await getOrchestratorAndClient({
        persistenceSupport: 'kvs',
        hideSensitiveInformation: false,
    });

    const runner = await generateActorTestRunner(client);

    const run = await runner.call(1, 42);
    if (!run) {
        return { success: false, details: 'Run was not started successfully.' };
    }

    const output = await run.getTotalOutput();
    if (output !== 42) {
        return { success: false, details: `Unexpected output: ${output}` };
    }

    const trackedValue = await getOrchestratorTrackedValue(testIndex);
    try {
        const trackedRuns = trackedValue as TrackedRuns;
        if (trackedRuns.current[run.runName].status !== 'SUCCEEDED') {
            return { success: false, details: `Unexpected run status: ${trackedRuns.current[run.runName].status}` };
        }
    } catch (err) {
        return { success: false, details: `Error parsing tracked runs: ${(err as Error).message}` };
    }

    return { success: true };
}

async function childRunWithEncryptedPersistence(): Promise<TestResult> {
    const { client, testIndex } = await getOrchestratorAndClient({
        persistenceSupport: 'kvs',
        hideSensitiveInformation: true,
        persistenceEncryptionKey: 'test-key',
    });

    const runner = await generateActorTestRunner(client);

    const run = await runner.call(1, 84);
    if (!run) {
        return { success: false, details: 'Run was not started successfully.' };
    }

    const output = await run.getTotalOutput();
    if (output !== 84) {
        return { success: false, details: `Unexpected output: ${output}` };
    }

    const trackedValue = await getOrchestratorTrackedValue(testIndex);
    if (trackedValue === null) {
        return { success: false, details: 'Tracked runs object is null.' };
    }

    try {
        const trackedRuns = trackedValue as TrackedRuns;
        const runStatus = trackedRuns.current[run.runName].status;
        return { success: false, details: `Expected run status to be hidden, but got: ${runStatus}` };
    } catch {
        return { success: true };
    }
}

async function childRunFromTask(): Promise<TestResult> {
    const { client } = await getOrchestratorAndClient({
        persistenceSupport: 'none',
        hideSensitiveInformation: false,
    });

    using runner = await TestTransientTaskRunner.new(client, 'e2e-child-task-runner', 50);

    const run = await runner.call(1);
    if (!run) {
        return { success: false, details: 'Run was not started successfully.' };
    }

    const output = await run.getTotalOutput();
    if (output !== 50) {
        return { success: false, details: `Unexpected output: ${output}` };
    }

    return { success: true };
}
