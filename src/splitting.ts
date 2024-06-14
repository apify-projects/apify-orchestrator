import { ActorInput, RunRequest } from './run-request.js';

const APIFY_PAYLOAD_BYTES_LIMIT = 9437184;

const strBytes = (string: string) => (new TextEncoder().encode(string)).length;

export interface SplitInputRules {
    respectApifyPayloadLimit?: boolean
}

export function generateInputChunks<T>(
    sources: T[],
    inputGenerator: (sources: T[]) => Record<string, unknown>,
    rules?: SplitInputRules,
): ActorInput[] {
    if (rules?.respectApifyPayloadLimit) {
        let parts = 1;
        let inputs: Record<string, unknown>[] = [inputGenerator(sources)];

        while (
            parts < sources.length
        && inputs.every((input) => strBytes(JSON.stringify(input)) > APIFY_PAYLOAD_BYTES_LIMIT)
        ) {
            parts++;
            const size = Math.ceil(sources.length / parts);
            inputs = [];
            for (let i = 0; i < sources.length; i += size) {
                inputs.push(inputGenerator(sources.slice(i, i + size)));
            }
        }

        return inputs;
    }

    return [inputGenerator(sources)];
}

export function generateRunRequests(masterRunRequest: RunRequest, inputChunks: ActorInput[]): RunRequest[] {
    return inputChunks.map((input, index) => {
        const runName = inputChunks.length > 1
            ? `${masterRunRequest.runName}-${index}/${inputChunks.length}`
            : masterRunRequest.runName;
        return {
            ...masterRunRequest,
            runName,
            input,
        };
    });
}
