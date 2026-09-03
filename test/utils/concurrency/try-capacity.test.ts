import { TryCapacity } from 'src/utils/concurrency/try-capacity.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('TryCapacity', () => {
    const fn = vi.fn();
    let inUse: number;

    function buildCapacity(limit: number) {
        return new TryCapacity(limit, () => inUse);
    }

    beforeEach(() => {
        inUse = 0;
        vi.mocked(fn).mockResolvedValue('success');
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    it('allows execution when no capacity is in use', async () => {
        const outcome = await buildCapacity(2).attempt(fn);

        expect(outcome.value).toBe('success');
        expect(fn).toHaveBeenCalledTimes(1);
    });

    it('allows execution when some capacity is still available', async () => {
        inUse = 1;

        const outcome = await buildCapacity(2).attempt(fn);

        expect(outcome.value).toBe('success');
        expect(fn).toHaveBeenCalledTimes(1);
    });

    it('blocks execution when the limit has been reached', async () => {
        inUse = 2;

        const outcome = await buildCapacity(2).attempt(fn);

        expect(outcome.value).toBe('capacity-reached');
        expect(fn).not.toHaveBeenCalled();
    });

    it('blocks execution when the limit has been exceeded', async () => {
        inUse = 5;

        const outcome = await buildCapacity(2).attempt(fn);

        expect(outcome.value).toBe('capacity-reached');
        expect(fn).not.toHaveBeenCalled();
    });

    it('reads the capacity in use on every attempt', async () => {
        const capacity = buildCapacity(1);

        inUse = 1;
        expect((await capacity.attempt(fn)).value).toBe('capacity-reached');

        inUse = 0;
        expect((await capacity.attempt(fn)).value).toBe('success');

        inUse = 1;
        expect((await capacity.attempt(fn)).value).toBe('capacity-reached');

        expect(fn).toHaveBeenCalledTimes(1);
    });
});
