import { describe, expect, it } from 'vitest';

import { hashObject } from './hash.js';

describe('hashObject', () => {
    it('returns the same hash for the same object', () => {
        const obj = { a: 1, b: 2, c: 3 };
        const hash = hashObject(obj);
        expect(hash).toMatchSnapshot();
        expect(hash).toEqual(hashObject({ a: 1, b: 2, c: 3 }));
    });

    it('returns different hashes for different objects', () => {
        expect(hashObject({ a: 1, b: 2, c: 3 })).not.toEqual(hashObject({ a: 1, b: 2, c: 4 }));
    });

    it('works with nested objects with different property orders', () => {
        const obj1 = { a: 1, b: { c: 2, d: 3 }, e: [1, 2, 3] };
        const obj2 = { b: { d: 3, c: 2 }, a: 1, e: [1, 2, 3] };
        expect(hashObject(obj1)).toEqual(hashObject(obj2));
    });

    it('does not match arrays with different orders', () => {
        const obj1 = { a: [1, 2, 3] };
        const obj2 = { a: [3, 2, 1] };
        expect(hashObject(obj1)).not.toEqual(hashObject(obj2));
    });
});
