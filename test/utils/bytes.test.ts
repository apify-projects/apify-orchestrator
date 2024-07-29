import { splitIntoChunksWithMaxSize, strBytes } from 'src/utils/bytes.js';

describe('splitIntoChunksWithMaxSize', () => {
    it('correctly generates input batches', () => {
        const sources = [...Array(1000).keys()];
        interface Input {
            startUrls: { url: string }[]
        }
        const inputGenerator = (numbers: number[]): Input => ({
            startUrls: numbers.map((n) => ({ url: `https://num.com/${(`00000${n}`).slice(5)}` })),
        });
        const sizeLimit = 128;
        const inputBatches = splitIntoChunksWithMaxSize(sources, inputGenerator, sizeLimit);
        const urls = new Set<string>();
        for (const input of inputBatches) {
            for (const { url } of (input as Input).startUrls) {
                expect(urls).not.toContain(url);
                urls.add(url);
            }
            expect(strBytes(JSON.stringify(input))).toBeLessThanOrEqual(sizeLimit);
            expect('startUrls' in input).toBeTruthy();
        }
    });
});
