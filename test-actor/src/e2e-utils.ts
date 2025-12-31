import { Actor, log } from 'apify';

import { getActorId } from './actor-id.js';
import type { TestResult } from './e2e.js';
import type { ExtendedApifyClient, OrchestratorOptions } from './orchestrator/index.js';
import { Orchestrator } from './orchestrator/index.js';
import type { RunOutput } from './resurrection-test.js';
import { TestActorRunner } from './test-actor-runner.js';

const CHILD_MEMORY_MB = 256;
const CHILD_WAIT_SECONDS = 3;

/**
 * A counter to ensure unique test indices for each orchestrator/client pair.
 * The counter is global, because tests may create multiple orchestrators/clients, that ensure global uniqueness.
 */
let testCounter = 0;

export function testLog(testName: string) {
    return log.child({ prefix: `[${testName}]` });
}

export interface OrchestratorAndClient {
    orchestrator: Orchestrator;
    client: ExtendedApifyClient;
    testIndex: number;
}

export async function getOrchestratorAndClient(
    orchestratorOptions: Partial<OrchestratorOptions>,
): Promise<OrchestratorAndClient> {
    const orchestrator = new Orchestrator(orchestratorOptions);
    const client = await orchestrator.apifyClient();
    testCounter++;
    return { orchestrator, client, testIndex: testCounter };
}

export async function generateActorTestRunner(client: ExtendedApifyClient): Promise<TestActorRunner> {
    return TestActorRunner.new(client, { childMemoryMbytes: CHILD_MEMORY_MB, childWaitSeconds: CHILD_WAIT_SECONDS });
}

export async function getOrchestratorTrackedValue(index: number): Promise<unknown> {
    // Ensure Orchestrator state is persisted
    const eventManager = Actor.config.getEventManager();
    eventManager.emit('persistState');
    await eventManager.waitForAllListenersToComplete();

    const key = index <= 1 ? 'ORCHESTRATOR-CLIENT-RUNS' : `ORCHESTRATOR-${index}-CLIENT-${index}-RUNS`;

    log.info(`Fetching orchestrator tracked value`, { key });
    const value = await Actor.getValue(key);

    return value;
}

export interface ResurrectionTestOutput {
    runsBeforeResurrection: { [runName: string]: RunOutput };
    runsAfterResurrection: { [runName: string]: RunOutput };
}

export async function runResurrectionTest(
    client: ExtendedApifyClient,
    runName: string,
    orchestratorOptions: Partial<OrchestratorOptions>,
): Promise<ResurrectionTestOutput> {
    const actorId = await getActorId();
    const testRun = await client.actor(actorId).call(runName, { role: 'resurrection-test', orchestratorOptions });

    // During the first execution, the child run shut itself down, and now we are resurrecting it.
    const resurrectedRun = await client.run(testRun.id).resurrect();
    await client.run(resurrectedRun.id).waitForFinish();

    const runsBeforeResurrection: { [runName: string]: RunOutput } = {};
    const runsAfterResurrection: { [runName: string]: RunOutput } = {};

    const outputIterator = client.dataset<RunOutput>(resurrectedRun.defaultDatasetId).iterate({ pageSize: 100 });
    for await (const runOutput of outputIterator) {
        if (runOutput.resurrected) {
            runsAfterResurrection[runOutput.runName] = runOutput;
        } else {
            runsBeforeResurrection[runOutput.runName] = runOutput;
        }
    }

    return { runsBeforeResurrection, runsAfterResurrection };
}

export function checkResurrectionTestOutputCompleteness(
    runsBeforeResurrection: { [runName: string]: RunOutput },
    runsAfterResurrection: { [runName: string]: RunOutput },
): TestResult | null {
    if (Object.keys(runsBeforeResurrection).length === 0) {
        log.error('No runs found before resurrection');
        return { success: false, details: 'No runs found before resurrection' };
    }
    if (Object.keys(runsAfterResurrection).length !== Object.keys(runsBeforeResurrection).length) {
        log.error('Number of runs after resurrection does not match number before resurrection');
        return {
            success: false,
            details: 'Number of runs after resurrection does not match number before resurrection',
        };
    }

    for (const [runName, runOutput] of Object.entries(runsAfterResurrection)) {
        if (runOutput.status !== 'SUCCEEDED') {
            log.error(`Resurrected run ${runName} has unexpected status: ${runOutput.status}`);
            return { success: false, details: `Resurrected run ${runName} has unexpected status: ${runOutput.status}` };
        }
        const runOutputBeforeResurrection = runsBeforeResurrection[runName];
        if (!runOutputBeforeResurrection) {
            log.error(`No output found for run ${runName} before resurrection`);
            return { success: false, details: `No output found for run ${runName} before resurrection` };
        }
    }

    return null;
}
