import { log } from 'apify';

import type { ExtendedApifyClient, ExtendedTaskClient } from './orchestrator/types.js';
import { TestRun } from './test-run.js';

export class TestTaskRunner {
    private readonly taskClient: ExtendedTaskClient;

    constructor(
        private readonly apifyClient: ExtendedApifyClient,
        private readonly taskId: string,
    ) {
        this.taskClient = apifyClient.task(taskId);
    }

    async call(index: number): Promise<TestRun | null> {
        try {
            const run = await this.taskClient.call(undefined, { runName: `child-task-${index}` });
            return new TestRun(this.apifyClient, run, index);
        } catch (error) {
            log.exception(error as Error, `Error calling child task for child actor ${index}`, {
                taskId: this.taskId,
            });
            return null;
        }
    }
}
