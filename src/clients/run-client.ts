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
import type { ExtendedActorRun, ExtendedRunClient } from '../types.js';

export interface ExtRunClientOptions {
    requestId: string;
    onUpdate: (run?: ExtendedActorRun) => void;
}

export class ExtRunClient extends RunClient implements ExtendedRunClient {
    readonly requestId: string;
    private readonly context: OrchestratorContext;
    private readonly options: ExtRunClientOptions;

    /**
     * @internal
     */
    constructor(context: OrchestratorContext, options: ExtRunClientOptions, runClient: RunClient) {
        const { requestId } = options;
        super({
            baseUrl: runClient.baseUrl,
            publicBaseUrl: runClient.publicBaseUrl,
            resourcePath: runClient.resourcePath,
            apifyClient: runClient.apifyClient,
            httpClient: runClient.httpClient,
            id: runClient.id,
            params: runClient.params,
        });
        this.requestId = requestId;
        this.context = context;
        this.options = options;
    }

    override async get(options?: RunGetOptions): Promise<ExtendedActorRun | undefined> {
        const run = await super.get(options);
        const extendedRun = run ? this.extendedRun(run) : undefined;
        this.options.onUpdate(extendedRun);
        return extendedRun;
    }

    override async abort(options?: RunAbortOptions | undefined): Promise<ExtendedActorRun> {
        const run = await super.abort(options);
        const extendedRun = this.extendedRun(run);
        this.options.onUpdate(extendedRun);
        return extendedRun;
    }

    override async delete(): Promise<void> {
        // TODO: implement
        this.context.logger.prefixed(this.requestId).warning('Delete Run is not supported yet in the Orchestrator.');
        await super.delete();
    }

    override async metamorph(
        targetActorId: string,
        input: unknown,
        options?: RunMetamorphOptions | undefined,
    ): Promise<ActorRun> {
        // TODO: implement
        this.context.logger.prefixed(this.requestId).warning('Metamorph Run is not supported yet in the Orchestrator.');
        return super.metamorph(targetActorId, input, options);
    }

    override async reboot(): Promise<ExtendedActorRun> {
        const run = await super.reboot();
        const extendedRun = this.extendedRun(run);
        this.options.onUpdate(extendedRun);
        return extendedRun;
    }

    override async update(newFields: RunUpdateOptions): Promise<ExtendedActorRun> {
        const run = await super.update(newFields);
        const extendedRun = this.extendedRun(run);
        this.options.onUpdate(extendedRun);
        return extendedRun;
    }

    override async resurrect(options?: RunResurrectOptions): Promise<ExtendedActorRun> {
        const run = await super.resurrect(options);
        const extendedRun = this.extendedRun(run);
        this.options.onUpdate(extendedRun);
        return extendedRun;
    }

    override async waitForFinish(options?: RunWaitForFinishOptions): Promise<ExtendedActorRun> {
        const run = await super.waitForFinish(options);
        const extendedRun = this.extendedRun(run);
        this.options.onUpdate(extendedRun);
        return extendedRun;
    }

    private extendedRun(run: ActorRun): ExtendedActorRun {
        return { ...run, requestId: this.requestId };
    }
}
