import { Actor, log } from "apify";

import type { ExtendedApifyClient, OrchestratorOptions } from "./orchestrator/index.js";
import { Orchestrator } from "./orchestrator/index.js";
import { TestActorRunner } from "./test-actor-runner.js";

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