import { MAIN_LOOP_INTERVAL_MS } from 'src/constants.js';
import { Orchestrator, ScheduledApifyClient } from 'src/index.js';
import * as apifyApi from 'src/utils/apify-api.js';

describe('apify-client', () => {
    let orchestrator: Orchestrator;
    let client: ScheduledApifyClient;

    beforeEach(async () => {
        vi.useFakeTimers();
        orchestrator = new Orchestrator({
            enableLogs: false,
            persistSupport: 'none',
        });
        client = await orchestrator.apifyClient();
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.resetAllMocks();
    });

    it('starts the scheduler upon creation', async () => {
        const getAvailableMemorySpy = vi.spyOn(apifyApi, 'getAvailableMemoryGBs')
            .mockImplementation(async () => {
                return 0;
            });
        client.actor('test').enqueue({ runName: 'test' });
        vi.advanceTimersByTime(MAIN_LOOP_INTERVAL_MS);
        expect(getAvailableMemorySpy).toHaveBeenCalledTimes(1);
    });
});
