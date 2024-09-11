async function indexedNext<T>(iterator: AsyncGenerator<T>, index: number) {
    const result = await iterator.next();
    return { result, index };
}

export async function* combineAsyncIterators<T>(iterators: AsyncGenerator<T>[]): AsyncGenerator<T, void, void> {
    const nextPromises = new Map(iterators.map((iterator, index) => ([index, indexedNext(iterator, index)])));
    while (nextPromises.size > 0) {
        const { result, index } = await Promise.race(nextPromises.values());
        if (result.done) {
            nextPromises.delete(index);
            continue;
        }
        nextPromises.set(index, indexedNext(iterators[index], index));
        yield result.value;
    }
}
