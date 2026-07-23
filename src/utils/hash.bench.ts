import { createHash } from 'node:crypto';

import { murmur3 } from 'murmurhash-js';
import { afterAll, bench, describe } from 'vitest';

// Shared sink that every benchmark callback writes its result into. Without this, a pure function
// call whose return value is discarded is a candidate for dead-code elimination by the JIT, which
// would make the "hashing" benchmarks measure an empty loop instead of the actual hash computation.
// Reading `sink` in `afterAll` keeps the assignments observable.
let sink = '';

// Candidate hash implementations, compared against the current `murmur3` (32-bit) used by `hashObject`.

function murmur32(str: string): string {
    return murmur3(str).toString(16);
}

// Two independently-seeded murmur3 hashes concatenated: still non-cryptographic and fast, but 64 bits wide.
function murmur64(str: string): string {
    return murmur3(str, 0).toString(16).padStart(8, '0') + murmur3(str, 1).toString(16).padStart(8, '0');
}

function md5(str: string): string {
    return createHash('md5').update(str).digest('hex');
}

function sha1(str: string): string {
    return createHash('sha1').update(str).digest('hex');
}

function sha256(str: string): string {
    return createHash('sha256').update(str).digest('hex');
}

const smallPayload = JSON.stringify({
    url: 'https://example.com',
    maxItems: 100,
    proxy: { useApifyProxy: true },
});

const largePayload = JSON.stringify({
    startUrls: Array.from({ length: 200 }, (_, i) => ({ url: `https://example.com/page/${i}` })),
    maxItems: 10_000,
    proxy: { useApifyProxy: true, apifyProxyGroups: ['RESIDENTIAL'] },
    customData: { nested: { deeply: { value: 'x'.repeat(500) } } },
});

describe('hash algorithms - small payload (~80 bytes)', () => {
    bench('murmur3 (32-bit)', () => {
        sink = murmur32(smallPayload);
    });
    bench('murmur3 x2 (64-bit)', () => {
        sink = murmur64(smallPayload);
    });
    bench('md5 (128-bit)', () => {
        sink = md5(smallPayload);
    });
    bench('sha1 (160-bit)', () => {
        sink = sha1(smallPayload);
    });
    bench('sha256 (256-bit)', () => {
        sink = sha256(smallPayload);
    });
});

describe('hash algorithms - large payload (~10 KB)', () => {
    bench('murmur3 (32-bit)', () => {
        sink = murmur32(largePayload);
    });
    bench('murmur3 x2 (64-bit)', () => {
        sink = murmur64(largePayload);
    });
    bench('md5 (128-bit)', () => {
        sink = md5(largePayload);
    });
    bench('sha1 (160-bit)', () => {
        sink = sha1(largePayload);
    });
    bench('sha256 (256-bit)', () => {
        sink = sha256(largePayload);
    });
});

afterAll(() => {
    // Force a read of `sink` after all benchmarks have run, so the compiler cannot treat the
    // assignments above as dead stores.
    if (!sink) {
        throw new Error('Benchmarks produced no output - hashing may have been eliminated as dead code.');
    }
});
