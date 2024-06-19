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
import { ApiClientOptionsWithOptionalResourcePath } from 'apify-client/dist/base/api_client';

import { CustomLogger } from '../utils/logging.js';
import { RunsTracker } from '../utils/tracking.js';

export class TrackingRunClient extends RunClient {
    readonly runName: string;

    protected customLogger: CustomLogger;
    protected runsTracker: RunsTracker;

    constructor(
        options: ApiClientOptionsWithOptionalResourcePath,
        runName: string,
        customLogger: CustomLogger,
        runsTracker: RunsTracker,
    ) {
        super(options);
        this.runName = runName;
        this.customLogger = customLogger;
        this.runsTracker = runsTracker;
    }

    override async get(options?: RunGetOptions): Promise<ActorRun | undefined> {
        const run = await super.get(options);
        if (run) { await this.runsTracker.updateRun(this.runName, run); }
        return run;
    }

    override async abort(options?: RunAbortOptions | undefined): Promise<ActorRun> {
        const run = await super.abort(options);
        await this.runsTracker.updateRun(this.runName, run);
        return run;
    }

    override async delete(): Promise<void> {
        this.customLogger.prfxWarn(this.runName, 'Delete Run is not supported yet.');
        await super.delete();
    }

    override async metamorph(targetActorId: string, input: unknown, options?: RunMetamorphOptions | undefined): Promise<ActorRun> {
        this.customLogger.prfxWarn(this.runName, 'Metamorph Run is not supported yet.');
        return super.metamorph(targetActorId, input, options);
    }

    override async reboot(): Promise<ActorRun> {
        const run = await super.reboot();
        await this.runsTracker.updateRun(this.runName, run);
        return run;
    }

    override async update(newFields: RunUpdateOptions): Promise<ActorRun> {
        const run = await super.update(newFields);
        await this.runsTracker.updateRun(this.runName, run);
        return run;
    }

    override async resurrect(options?: RunResurrectOptions): Promise<ActorRun> {
        const run = await super.resurrect(options);
        await this.runsTracker.updateRun(this.runName, run);
        return run;
    }

    override async waitForFinish(options?: RunWaitForFinishOptions): Promise<ActorRun> {
        const run = await super.waitForFinish(options);
        await this.runsTracker.updateRun(this.runName, run);
        return run;
    }
}
