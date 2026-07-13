import type { ExtendedDatasetClient } from '../types.js';
import type { Output, TestResult } from './types.js';
import { generateActorTestRunner, getOrchestratorAndClient } from './utils.js';

const TEST_VALUES = [1, 2, 3, 4, 5];
const PAGE_SIZE = 2;
const GREEDY_POLL_INTERVAL_SECS = 2;
const CHILD_OUTPUT_INTERVAL_SECS = 2;

function valuesMatch(actual: number[], expected: number[]): boolean {
    return JSON.stringify(actual) === JSON.stringify(expected);
}

export async function datasetIteration(): Promise<TestResult> {
    const { client } = await getOrchestratorAndClient({
        persistenceSupport: 'none',
        hideSensitiveInformation: false,
    });

    const runner = await generateActorTestRunner(client);

    const run = await runner.call(1, { numbersToOutput: TEST_VALUES });
    if (!run) {
        return { success: false, details: 'Run was not started successfully.' };
    }

    const dataset = client.dataset<Output>(run.run.defaultDatasetId);

    const readItems: number[] = [];
    for await (const item of dataset.iterate({ pageSize: PAGE_SIZE })) {
        readItems.push(item.value);
    }
    if (!valuesMatch(readItems, TEST_VALUES)) {
        return { success: false, details: `Unexpected items from iterate: ${JSON.stringify(readItems)}` };
    }

    const readBatches: number[][] = [];
    for await (const batch of dataset.iterateBatched({ pageSize: PAGE_SIZE })) {
        readBatches.push(batch.map((item) => item.value));
    }
    if (readBatches.some((batch) => batch.length === 0 || batch.length > PAGE_SIZE)) {
        return {
            success: false,
            details: `Unexpected batch sizes from iterateBatched: ${JSON.stringify(readBatches)}`,
        };
    }
    if (!valuesMatch(readBatches.flat(), TEST_VALUES)) {
        return { success: false, details: `Unexpected items from iterateBatched: ${JSON.stringify(readBatches)}` };
    }

    const unpaginatedBatches: number[][] = [];
    for await (const batch of dataset.iterateBatched({})) {
        unpaginatedBatches.push(batch.map((item) => item.value));
    }
    if (unpaginatedBatches.length !== 1 || !valuesMatch(unpaginatedBatches[0], TEST_VALUES)) {
        return {
            success: false,
            details: `Unexpected batches from iterateBatched without pageSize: ${JSON.stringify(unpaginatedBatches)}`,
        };
    }

    return { success: true };
}

export async function greedyDatasetIteration(): Promise<TestResult> {
    const { client } = await getOrchestratorAndClient({
        persistenceSupport: 'none',
        hideSensitiveInformation: false,
    });

    const runner = await generateActorTestRunner(client);

    // Start the run without waiting for it to finish, so that the parent iterates the dataset
    // greedily while the child is still producing items.
    const run = await runner.start(1, { numbersToOutput: TEST_VALUES, outputIntervalSecs: CHILD_OUTPUT_INTERVAL_SECS });
    if (!run) {
        return { success: false, details: 'Run was not started successfully.' };
    }

    const dataset = client.dataset<Output>(run.run.defaultDatasetId);

    // Both greedy iterators poll the same dataset independently, so they can run concurrently.
    const [readItems, readBatches] = await Promise.all([collectGreedyItems(dataset), collectGreedyBatches(dataset)]);

    if (!valuesMatch(readItems, TEST_VALUES)) {
        return { success: false, details: `Unexpected items from greedyIterate: ${JSON.stringify(readItems)}` };
    }
    if (readBatches.some((batch) => batch.length === 0 || batch.length > PAGE_SIZE)) {
        return {
            success: false,
            details: `Unexpected batch sizes from greedyIterateBatched: ${JSON.stringify(readBatches)}`,
        };
    }
    if (!valuesMatch(readBatches.flat(), TEST_VALUES)) {
        return {
            success: false,
            details: `Unexpected items from greedyIterateBatched: ${JSON.stringify(readBatches)}`,
        };
    }

    return { success: true };
}

export async function mergedDatasetIteration(): Promise<TestResult> {
    const { orchestrator, client } = await getOrchestratorAndClient({
        persistenceSupport: 'none',
        hideSensitiveInformation: false,
    });

    const runner = await generateActorTestRunner(client);

    const [run1, run2] = await Promise.all([
        runner.call(1, { numbersToOutput: [1, 2, 3] }),
        runner.call(2, { numbersToOutput: [4, 5] }),
    ]);
    if (!run1 || !run2) {
        return { success: false, details: 'One of the runs was not started successfully.' };
    }

    const mergedDatasets = orchestrator.mergeDatasets(
        client.dataset<Output>(run1.run.defaultDatasetId),
        client.dataset<Output>(run2.run.defaultDatasetId),
    );

    const readItems: number[] = [];
    for await (const item of mergedDatasets.iterate({ pageSize: PAGE_SIZE })) {
        readItems.push(item.value);
    }
    if (!valuesMatch(readItems, TEST_VALUES)) {
        return { success: false, details: `Unexpected items from merged iterate: ${JSON.stringify(readItems)}` };
    }

    const readBatches: number[][] = [];
    for await (const batch of mergedDatasets.iterateBatched({ pageSize: PAGE_SIZE })) {
        readBatches.push(batch.map((item) => item.value));
    }
    if (readBatches.some((batch) => batch.length === 0 || batch.length > PAGE_SIZE)) {
        return {
            success: false,
            details: `Unexpected batch sizes from merged iterateBatched: ${JSON.stringify(readBatches)}`,
        };
    }
    if (!valuesMatch(readBatches.flat(), TEST_VALUES)) {
        return {
            success: false,
            details: `Unexpected items from merged iterateBatched: ${JSON.stringify(readBatches)}`,
        };
    }

    return { success: true };
}

async function collectGreedyItems(dataset: ExtendedDatasetClient<Output>): Promise<number[]> {
    const values: number[] = [];
    const iterator = dataset.greedyIterate({ pageSize: PAGE_SIZE, pollIntervalSecs: GREEDY_POLL_INTERVAL_SECS });
    for await (const item of iterator) {
        values.push(item.value);
    }
    return values;
}

async function collectGreedyBatches(dataset: ExtendedDatasetClient<Output>): Promise<number[][]> {
    const batches: number[][] = [];
    const iterator = dataset.greedyIterateBatched({
        pageSize: PAGE_SIZE,
        pollIntervalSecs: GREEDY_POLL_INTERVAL_SECS,
    });
    for await (const batch of iterator) {
        batches.push(batch.map((item) => item.value));
    }
    return batches;
}
