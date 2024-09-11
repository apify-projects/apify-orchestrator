import { getUserLimits } from 'src/utils/apify-api.js';

describe('apify-api utils', () => {
    describe('getUserLimits', async () => {
        afterEach(() => {
            vi.resetAllMocks();
        });

        it('maps the response values to the return values correctly', async () => {
            const fetchSpy = vi.spyOn(global, 'fetch');

            fetchSpy.mockImplementationOnce(async () => ({
                json: async () => ({
                    data: {
                        limits: {
                            maxActorMemoryGbytes: 16,
                            maxConcurrentActorJobs: 25,
                        },
                        current: {
                            actorMemoryGbytes: 4,
                            activeActorJobCount: 3,
                        },
                    },
                }),
            } as Response));
            const limits = await getUserLimits('test-token');
            expect(fetchSpy).toHaveBeenCalledWith('https://api.apify.com/v2/users/me/limits?token=test-token');
            expect(limits).toEqual({
                currentMemoryUsageGBs: 4,
                maxMemoryGBs: 16,
                activeActorJobCount: 3,
                maxConcurrentActorJobs: 25,
            });
        });

        it('returns positive infinity for each value in case of error', async () => {
            const fetchSpy = vi.spyOn(global, 'fetch');

            fetchSpy.mockImplementationOnce(async () => ({
                json: async () => ({
                    data: 'invalid-data',
                }),
            } as Response));
            const limits = await getUserLimits('test-token');
            expect(fetchSpy).toHaveBeenCalledWith('https://api.apify.com/v2/users/me/limits?token=test-token');
            expect(limits).toEqual({
                currentMemoryUsageGBs: Number.POSITIVE_INFINITY,
                maxMemoryGBs: Number.POSITIVE_INFINITY,
                activeActorJobCount: Number.POSITIVE_INFINITY,
                maxConcurrentActorJobs: Number.POSITIVE_INFINITY,
            });
        });
    });
});
