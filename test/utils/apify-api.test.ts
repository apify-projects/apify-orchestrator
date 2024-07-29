import { getAvailableMemoryGBs } from 'src/utils/apify-api.js';

describe('getAvailableMemoryGBs', async () => {
    afterEach(() => {
        vi.resetAllMocks();
    });

    it('returns the correct amount of memory depending on the response', async () => {
        const fetchSpy = vi.spyOn(global, 'fetch');

        fetchSpy.mockImplementationOnce(async () => ({
            json: async () => ({
                data: {
                    limits: {
                        maxActorMemoryGbytes: 16,
                    },
                    current: {
                        actorMemoryGbytes: 4,
                    },
                },
            }),
        } as Response));
        const availableMemory = await getAvailableMemoryGBs('test-token');
        expect(fetchSpy).toHaveBeenCalledWith('https://api.apify.com/v2/users/me/limits?token=test-token');
        expect(availableMemory).toBe(12);
    });

    it('returns 0 if the response is malformed', async () => {
        const fetchSpy = vi.spyOn(global, 'fetch');

        fetchSpy.mockImplementationOnce(async () => ({
            json: async () => ({
                data: 'invalid-data',
            }),
        } as Response));
        const availableMemory = await getAvailableMemoryGBs('test-token');
        expect(fetchSpy).toHaveBeenCalledWith('https://api.apify.com/v2/users/me/limits?token=test-token');
        expect(availableMemory).toBe(0);
    });
});
