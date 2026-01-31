import type { Dictionary } from 'apify-client';

import { APIFY_PAYLOAD_BYTES_LIMIT } from '../constants.js';
import type { SplitRules } from '../types.js';

export const strBytes = (string: string) => new TextEncoder().encode(string).length;

export function splitIntoChunksWithMaxSize<T>(
    sources: T[],
    inputGenerator: (sources: T[]) => Dictionary,
    maxBytesSize: number,
): Dictionary[] {
    let parts = 1;
    let inputs: Dictionary[] = [inputGenerator(sources)];

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
    inputGenerator: (chunk: T[]) => Dictionary,
    { respectApifyMaxPayloadSize }: SplitRules,
    fixedInputToAddLater?: Dictionary,
): Dictionary[] {
    if (respectApifyMaxPayloadSize) {
        const maxSize = APIFY_PAYLOAD_BYTES_LIMIT - strBytes(JSON.stringify(fixedInputToAddLater));
        return splitIntoChunksWithMaxSize(sources, inputGenerator, maxSize);
    }

    // Do not split
    return [inputGenerator(sources)];
}
