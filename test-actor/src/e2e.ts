import { generateActorTestRunner, getOrchestratorAndClient, getOrchestratorTrackedValue, testLog } from './e2e-utils.js';
import type { TrackedRuns } from './orchestrator/run-tracker.js';

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
    ];

    const output: EndToEndTestOutput = {};

    for (const test of tests) {
        const [testName, result] = await test();
        testLog(testName).info('Test finished', result);
        output[testName] = result;
    }

    return output;
}

async function childRunWithoutPersistence(): Promise<[string, TestResult]> {
    const testName = 'child-run-without-persistence';
    testLog(testName).info('Starting test');

    const { client } = await getOrchestratorAndClient({
        persistenceSupport: 'none',
    });

    const runner = await generateActorTestRunner(client);

    const [run1, run2, run3] = await Promise.all(
        Array.from({ length: 3 }).map(async (_, index) => {
            const childNumber = index + 1;
            return runner.call(childNumber, childNumber * 10);
        }),
    );

    if (!run1 || !run2 || !run3) {
        return [testName, { success: false, details: 'One of the runs was not started successfully.' }];
    }

    const output1 = await run1.getTotalOutput();
    const output2 = await run2.getTotalOutput();
    const output3 = await run3.getTotalOutput();

    if (output1 !== 10 || output2 !== 20 || output3 !== 30) {
        return [testName, { success: false, details: `Unexpected outputs: ${output1}, ${output2}, ${output3}` }];
    }

    return [testName, { success: true }];
}

async function childRunWithPlainPersistence(): Promise<[string, TestResult]> {
    const testName = 'child-run-with-plain-persistence';
    testLog(testName).info('Starting test');

    const { client, testIndex } = await getOrchestratorAndClient({
        persistenceSupport: 'kvs',
        hideSensitiveInformation: false,
    });

    const runner = await generateActorTestRunner(client);

    const run = await runner.call(1, 42);
    if (!run) {
        return [testName, { success: false, details: 'Run was not started successfully.' }];
    }

    const output = await run.getTotalOutput();
    if (output !== 42) {
        return [testName, { success: false, details: `Unexpected output: ${output}` }];
    }

    const trackedValue = await getOrchestratorTrackedValue(testIndex);
    try {
        const trackedRuns = trackedValue as TrackedRuns;
        if (trackedRuns.current[run.runName].status !== 'SUCCEEDED') {
            return [
                testName,
                { success: false, details: `Unexpected run status: ${trackedRuns.current[run.runName].status}` },
            ];
        }
    } catch (err) {
        return [testName, { success: false, details: `Error parsing tracked runs: ${(err as Error).message}` }];
    }

    return [testName, { success: true }];
}

async function childRunWithEncryptedPersistence(): Promise<[string, TestResult]> {
    const testName = 'child-run-with-encrypted-persistence';
    testLog(testName).info('Starting test');

    const { client, testIndex } = await getOrchestratorAndClient({
    "persistenceSupport": "kvs",
    "hideSensitiveInformation": true,
    "persistenceEncryptionKey": "test-key"
});

    const runner = await generateActorTestRunner(client);

    const run = await runner.call(1, 84);
    if (!run) {
        return [testName, { success: false, details: 'Run was not started successfully.' }];
    }

    const output = await run.getTotalOutput();
    if (output !== 84) {
        return [testName, { success: false, details: `Unexpected output: ${output}` }];
    }

    const trackedValue = await getOrchestratorTrackedValue(testIndex);
    if (trackedValue === null) {
        return [testName, { success: false, details: 'Tracked runs object is null.' }];
    }

    try {
        const trackedRuns = trackedValue as TrackedRuns;
        const runStatus = trackedRuns.current[run.runName].status;
            return [
                testName,
                { success: false, details: `Expected run status to be hidden, but got: ${runStatus}` },
            ];
    } catch {
        return [testName, { success: true }];
    }
}
