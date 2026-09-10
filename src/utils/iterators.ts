export async function* iterateBatches<T>(
    generator: AsyncIterable<T, void, void>,
    batchSize: number,
): AsyncIterable<T[], void, void> {
    let batch: T[] = [];
    for await (const item of generator) {
        batch.push(item);
        if (batch.length === batchSize) {
            yield batch;
            batch = [];
        }
    }
    if (batch.length > 0) {
        yield batch;
    }
}
