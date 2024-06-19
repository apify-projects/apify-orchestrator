export const strBytes = (string: string) => (new TextEncoder().encode(string)).length;

export function splitIntoChunksWithMaxSize(
    sources: unknown[],
    inputGenerator: (sources: unknown[]) => object,
    maxBytesSize: number,
): object[] {
    let parts = 1;
    let inputs: object[] = [inputGenerator(sources)];

    while (
        parts < sources.length
        && inputs.every((input) => strBytes(JSON.stringify(input)) > maxBytesSize)
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
