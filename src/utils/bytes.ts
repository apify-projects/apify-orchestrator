import { APIFY_PAYLOAD_BYTES_LIMIT } from 'src/constants.js';
import type { SplitRules } from 'src/index.js';

export const strBytes = (string: string) => new TextEncoder().encode(string).length;

export function splitIntoChunksWithMaxSize<T>(
    sources: T[],
    inputGenerator: (sources: T[]) => object,
    maxBytesSize: number,
): object[] {
    let parts = 1;
    let inputs: object[] = [inputGenerator(sources)];

    while (parts < sources.length && inputs.some((input) => strBytes(JSON.stringify(input)) > maxBytesSize)) {
        parts++;
        const size = Math.ceil(sources.length / parts);
        inputs = [];
        for (let i = 0; i < sources.length; i += size) {
            inputs.push(inputGenerator(sources.slice(i, i + size)));
        }
    }

    return inputs;
}

export function generateInputChunks<T>(
    sources: T[],
    inputGenerator: (chunk: T[]) => object,
    { respectApifyMaxPayloadSize }: SplitRules,
    fixedInputToAddLater?: object,
): object[] {
    if (respectApifyMaxPayloadSize) {
        const maxSize = APIFY_PAYLOAD_BYTES_LIMIT - strBytes(JSON.stringify(fixedInputToAddLater));
        return splitIntoChunksWithMaxSize(sources, inputGenerator, maxSize);
    }

    // Do not split
    return [inputGenerator(sources)];
}
