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

import type { ExtendedRunClient } from '../types.js';
import type { OrchestratorContext } from '../utils/context.js';

export interface ExtRunClientOptions {
    runName: string;
}

export class ExtRunClient extends RunClient implements ExtendedRunClient {
    protected context: OrchestratorContext;

    readonly runName: string;

    protected superClient: RunClient;

    constructor(context: OrchestratorContext, options: ExtRunClientOptions, runClient: RunClient) {
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
        this.context = context;
        this.superClient = runClient;
        this.runName = runName;
    }

    override async get(options?: RunGetOptions): Promise<ActorRun | undefined> {
        const run = await this.superClient.get(options);
        if (run) {
            this.context.runTracker.updateRun(this.runName, run);
        } else {
            this.context.runTracker.declareLostRun(this.runName, 'Actor client could not retrieve the Run');
        }
        return run;
    }

    override async abort(options?: RunAbortOptions | undefined): Promise<ActorRun> {
        const run = await this.superClient.abort(options);
        this.context.runTracker.updateRun(this.runName, run);
        return run;
    }

    override async delete(): Promise<void> {
        // TODO: implement
        this.context.logger.prefixed(this.runName).warning('Delete Run is not supported yet in the Orchestrator.');
        await this.superClient.delete();
    }

    override async metamorph(
        targetActorId: string,
        input: unknown,
        options?: RunMetamorphOptions | undefined,
    ): Promise<ActorRun> {
        // TODO: implement
        this.context.logger.prefixed(this.runName).warning('Metamorph Run is not supported yet in the Orchestrator.');
        return this.superClient.metamorph(targetActorId, input, options);
    }

    override async reboot(): Promise<ActorRun> {
        const run = await this.superClient.reboot();
        this.context.runTracker.updateRun(this.runName, run);
        return run;
    }

    override async update(newFields: RunUpdateOptions): Promise<ActorRun> {
        const run = await this.superClient.update(newFields);
        this.context.runTracker.updateRun(this.runName, run);
        return run;
    }

    override async resurrect(options?: RunResurrectOptions): Promise<ActorRun> {
        const run = await this.superClient.resurrect(options);
        this.context.runTracker.updateRun(this.runName, run);
        return run;
    }

    override async waitForFinish(options?: RunWaitForFinishOptions): Promise<ActorRun> {
        this.context.logger.prefixed(this.runName).info('Waiting for finish');
        const run = await this.superClient.waitForFinish(options);
        this.context.runTracker.updateRun(this.runName, run);
        return run;
    }
}
