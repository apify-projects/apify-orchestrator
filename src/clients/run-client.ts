import {
    ActorRun,
    RunAbortOptions,
    RunClient,
    RunGetOptions,
    RunMetamorphOptions,
    RunResurrectOptions,
    RunUpdateOptions,
    RunWaitForFinishOptions,
} from 'apify-client';

import { RunsTracker } from '../tracker.js';
import { TrackedRunClient } from '../types.js';
import { CustomLogger } from '../utils/logging.js';

export class ExtRunClient extends RunClient implements TrackedRunClient {
    readonly runName: string;

    protected superClient: RunClient;
    protected customLogger: CustomLogger;
    protected runsTracker: RunsTracker;

    constructor(
        runClient: RunClient,
        runName: string,
        customLogger: CustomLogger,
        runsTracker: RunsTracker,
    ) {
        super({
            baseUrl: runClient.baseUrl,
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
        if (run) { await this.runsTracker.updateRun(this.runName, run); }
        return run;
    }

    override async abort(options?: RunAbortOptions | undefined): Promise<ActorRun> {
        const run = await this.superClient.abort(options);
        await this.runsTracker.updateRun(this.runName, run);
        return run;
    }

    override async delete(): Promise<void> {
        this.customLogger.prfxWarn(this.runName, 'Delete Run is not supported yet.');
        await this.superClient.delete();
    }

    override async metamorph(targetActorId: string, input: unknown, options?: RunMetamorphOptions | undefined): Promise<ActorRun> {
        this.customLogger.prfxWarn(this.runName, 'Metamorph Run is not supported yet.');
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
        this.customLogger.prfxInfo(this.runName, 'Waiting for finish', { url: this.url });
        const run = await this.superClient.waitForFinish(options);
        await this.runsTracker.updateRun(this.runName, run);
        return run;
    }
}
