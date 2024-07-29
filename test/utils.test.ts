import { getAvailableMemoryGBs } from 'src/utils/apify-api.js';
import { splitIntoChunksWithMaxSize, strBytes } from 'src/utils/bytes.js';

describe('apify-api', () => {
    afterEach(() => {
        vi.resetAllMocks();
    });

    describe('getAvailableMemoryGBs', async () => {
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
});

describe('bytes', () => {
    describe('splitIntoChunksWithMaxSize', () => {
        it('correctly generates input batches', () => {
            const sources = [...Array(9000).keys()];
            const inputGenerator = (numbers: number[]) => ({
                startUrls: numbers.map((n) => ({ url: `https://num.com/${(`00000${n}`).slice(5)}` })),
            });
            const sizeLimit = 128;
            const inputBatches = splitIntoChunksWithMaxSize(sources, inputGenerator, sizeLimit);
            for (const input of inputBatches) {
                expect(strBytes(JSON.stringify(input))).toBeLessThanOrEqual(sizeLimit);
                expect('startUrls' in input).toBeTruthy();
            }
        });
    });
});
