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

import type { RunsTracker } from '../tracker.js';
import type { ExtendedRunClient } from '../types.js';
import type { CustomLogger } from '../utils/logging.js';

export class ExtRunClient extends RunClient implements ExtendedRunClient {
    readonly runName: string;

    protected superClient: RunClient;
    protected customLogger: CustomLogger;
    protected runsTracker: RunsTracker;

    constructor(runClient: RunClient, runName: string, customLogger: CustomLogger, runsTracker: RunsTracker) {
        super({
            baseUrl: runClient.baseUrl,
            publicBaseUrl: runClient.publicBaseUrl,
            resourcePath: runClient.resourcePath,
            apifyClient: runClient.apifyClient,
            httpClient: runClient.httpClient,
            id: runClient.id,
            params: runClient.params,
        });
        this.superClient = runClient;
        this.runName = runName;
        this.customLogger = customLogger;
        this.runsTracker = runsTracker;
    }

    override async get(options?: RunGetOptions): Promise<ActorRun | undefined> {
        const run = await this.superClient.get(options);
        if (run) {
            await this.runsTracker.updateRun(this.runName, run);
        } else {
            await this.runsTracker.declareLostRun(this.runName, 'Actor client could not retrieve the Run');
        }
        return run;
    }

    override async abort(options?: RunAbortOptions | undefined): Promise<ActorRun> {
        const run = await this.superClient.abort(options);
        await this.runsTracker.updateRun(this.runName, run);
        return run;
    }

    override async delete(): Promise<void> {
        // TODO: implement
        this.customLogger.prfxWarn(this.runName, 'Delete Run is not supported yet in the Orchestrator.');
        await this.superClient.delete();
    }

    override async metamorph(
        targetActorId: string,
        input: unknown,
        options?: RunMetamorphOptions | undefined,
    ): Promise<ActorRun> {
        // TODO: implement
        this.customLogger.prfxWarn(this.runName, 'Metamorph Run is not supported yet in the Orchestrator.');
        return this.superClient.metamorph(targetActorId, input, options);
    }

    override async reboot(): Promise<ActorRun> {
        const run = await this.superClient.reboot();
        await this.runsTracker.updateRun(this.runName, run);
        return run;
    }

    override async update(newFields: RunUpdateOptions): Promise<ActorRun> {
        const run = await this.superClient.update(newFields);
        await this.runsTracker.updateRun(this.runName, run);
        return run;
    }

    override async resurrect(options?: RunResurrectOptions): Promise<ActorRun> {
        const run = await this.superClient.resurrect(options);
        await this.runsTracker.updateRun(this.runName, run);
        return run;
    }

    override async waitForFinish(options?: RunWaitForFinishOptions): Promise<ActorRun> {
        this.customLogger.prfxInfo(this.runName, 'Waiting for finish');
        const run = await this.superClient.waitForFinish(options);
        await this.runsTracker.updateRun(this.runName, run);
        return run;
    }
}
