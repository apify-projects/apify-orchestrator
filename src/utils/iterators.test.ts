import { describe, expect, it } from 'vitest';

import { iterateBatches } from './iterators.js';

async function* asyncGenerator<T>(items: T[]): AsyncIterable<T, void, void> {
    for (const item of items) {
        yield item;
    }
}

async function collectBatches<T>(iterable: AsyncIterable<T[], void, void>): Promise<T[][]> {
    const batches: T[][] = [];
    for await (const batch of iterable) {
        batches.push(batch);
    }
    return batches;
}

describe('iterators utils', () => {
    describe('iterateBatches', () => {
        it('yields no batches for an empty generator', async () => {
            const batches = await collectBatches(iterateBatches(asyncGenerator([]), 3));
            expect(batches).toEqual([]);
        });

        it('splits items into full batches when the count is a multiple of the batch size', async () => {
            const batches = await collectBatches(iterateBatches(asyncGenerator([1, 2, 3, 4, 5, 6]), 3));
            expect(batches).toEqual([
                [1, 2, 3],
                [4, 5, 6],
            ]);
        });

        it('yields a final partial batch when the count is not a multiple of the batch size', async () => {
            const batches = await collectBatches(iterateBatches(asyncGenerator([1, 2, 3, 4, 5]), 2));
            expect(batches).toEqual([[1, 2], [3, 4], [5]]);
        });

        it('yields a single partial batch when the batch size exceeds the item count', async () => {
            const batches = await collectBatches(iterateBatches(asyncGenerator([1, 2]), 5));
            expect(batches).toEqual([[1, 2]]);
        });

        it('yields one batch per item when the batch size is 1', async () => {
            const batches = await collectBatches(iterateBatches(asyncGenerator([1, 2, 3]), 1));
            expect(batches).toEqual([[1], [2], [3]]);
        });

        it('preserves item order within and across batches', async () => {
            const items = Array.from({ length: 10 }, (_, i) => i);
            const batches = await collectBatches(iterateBatches(asyncGenerator(items), 4));
            expect(batches.flat()).toEqual(items);
        });
    });
});
