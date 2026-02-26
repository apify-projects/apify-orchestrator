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

import type { OrchestratorContext } from '../context/orchestrator-context.js';
import type { ExtendedRunClient } from '../types.js';

export interface ExtRunClientOptions {
    runName: string;
    onUpdate: (run?: ActorRun) => void;
}

export class ExtRunClient extends RunClient implements ExtendedRunClient {
    readonly runName: string;
    private readonly context: OrchestratorContext;
    private readonly options: ExtRunClientOptions;

    /**
     * @internal
     */
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
        this.runName = runName;
        this.context = context;
        this.options = options;
    }

    override async get(options?: RunGetOptions): Promise<ActorRun | undefined> {
        const run = await super.get(options);
        this.options.onUpdate(run);
        return run;
    }

    override async abort(options?: RunAbortOptions | undefined): Promise<ActorRun> {
        const run = await super.abort(options);
        this.options.onUpdate(run);
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
        this.options.onUpdate(run);
        return run;
    }

    override async update(newFields: RunUpdateOptions): Promise<ActorRun> {
        const run = await super.update(newFields);
        this.options.onUpdate(run);
        return run;
    }

    override async resurrect(options?: RunResurrectOptions): Promise<ActorRun> {
        const run = await super.resurrect(options);
        this.options.onUpdate(run);
        return run;
    }

    override async waitForFinish(options?: RunWaitForFinishOptions): Promise<ActorRun> {
        const run = await super.waitForFinish(options);
        this.options.onUpdate(run);
        return run;
    }
}
