import type {
    ActorRun,
    RunAbortOptions,
    RunGetOptions,
    RunMetamorphOptions,
    RunResurrectOptions,
    RunUpdateOptions,
    RunWaitForFinishOptions,
} from 'apify-client';
import { RunClient } from 'apify-client';

import type { RunTracker } from '../run-tracker.js';
import type { ExtendedRunClient } from '../types.js';
import type { OrchestratorContext } from '../utils/context.js';
import type { ExtApifyClient } from './apify-client.js';

export interface ExtRunClientContext extends OrchestratorContext {
    apifyClient: ExtApifyClient;
    runTracker: RunTracker;
}

export interface ExtRunClientOptions {
    runName: string;
}

export class ExtRunClient extends RunClient implements ExtendedRunClient {
    private readonly runName: string;

    /**
     * @internal
     */
    constructor(
        private readonly context: ExtRunClientContext,
        options: ExtRunClientOptions,
        runClient: RunClient,
    ) {
        const { runName } = options;
        super({
            baseUrl: runClient.baseUrl,
            publicBaseUrl: runClient.publicBaseUrl,
            resourcePath: runClient.resourcePath,
            apifyClient: runClient.apifyClient,
            httpClient: runClient.httpClient,
            id: runClient.id,
            params: runClient.params,
        });
        this.runName = runName;
    }

    override async get(options?: RunGetOptions): Promise<ActorRun | undefined> {
        const run = await super.get(options);
        if (run) {
            this.updateInfo(run);
        } else {
            this.context.runTracker.declareLostRun(this.runName, 'Actor client could not retrieve the Run');
        }
        return run;
    }

    override async abort(options?: RunAbortOptions | undefined): Promise<ActorRun> {
        const run = await super.abort(options);
        this.updateInfo(run);
        return run;
    }

    override async delete(): Promise<void> {
        // TODO: implement
        this.context.logger.prefixed(this.runName).warning('Delete Run is not supported yet in the Orchestrator.');
        await super.delete();
    }

    override async metamorph(
        targetActorId: string,
        input: unknown,
        options?: RunMetamorphOptions | undefined,
    ): Promise<ActorRun> {
        // TODO: implement
        this.context.logger.prefixed(this.runName).warning('Metamorph Run is not supported yet in the Orchestrator.');
        return super.metamorph(targetActorId, input, options);
    }

    override async reboot(): Promise<ActorRun> {
        const run = await super.reboot();
        this.updateInfo(run);
        return run;
    }

    override async update(newFields: RunUpdateOptions): Promise<ActorRun> {
        const run = await super.update(newFields);
        this.updateInfo(run);
        return run;
    }

    override async resurrect(options?: RunResurrectOptions): Promise<ActorRun> {
        const run = await super.resurrect(options);
        this.updateInfo(run);
        return run;
    }

    override async waitForFinish(options?: RunWaitForFinishOptions): Promise<ActorRun> {
        const run = await super.waitForFinish(options);
        this.updateInfo(run);
        return run;
    }

    private updateInfo(run: ActorRun): void {
        this.context.runTracker.updateRun(this.runName, run);
    }
}
