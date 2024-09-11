import { MAIN_LOOP_INTERVAL_MS } from 'src/constants.js';
import { Orchestrator } from 'src/index.js';
import * as apifyApi from 'src/utils/apify-api.js';

describe('Apify Orchestrator', () => {
    let orchestrator: Orchestrator;

    beforeEach(async () => {
        vi.useFakeTimers();
        orchestrator = new Orchestrator({
            enableLogs: false,
        });
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.resetAllMocks();
    });

    it('starts the scheduler upon client creation', async () => {
        const client = await orchestrator.apifyClient();
        const getAvailableMemorySpy = vi.spyOn(apifyApi, 'getUserLimits')
            .mockImplementation(async () => ({
                currentMemoryUsageGBs: Number.POSITIVE_INFINITY,
                maxMemoryGBs: Number.POSITIVE_INFINITY,
                activeActorJobCount: Number.POSITIVE_INFINITY,
                maxConcurrentActorJobs: Number.POSITIVE_INFINITY,
            }));
        client.actor('test').enqueue({ runName: 'test' });
        vi.advanceTimersByTime(MAIN_LOOP_INTERVAL_MS);
        expect(getAvailableMemorySpy).toHaveBeenCalledTimes(1);
    });

    // TODO: test different configurations?
});
