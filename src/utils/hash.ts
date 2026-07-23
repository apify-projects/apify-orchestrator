import { createHash } from 'node:crypto';

/**
 * Recursively sorts object keys so that two objects with the same content, but different key order at any depth,
 * produce the same canonical representation.
 * Arrays keep their order, since it is significant.
 */
function canonicalize(value: unknown): unknown {
    if (Array.isArray(value)) {
        return value.map((item) => canonicalize(item));
    }
    if (value === null || typeof value !== 'object') {
        return value;
    }
    const sortedKeys = Object.keys(value).sort((a, b) => a.localeCompare(b));
    return Object.fromEntries(sortedKeys.map((key) => [key, canonicalize((value as Record<string, unknown>)[key])]));
}

function stringifyObject(obj: unknown): string {
    return JSON.stringify(canonicalize(obj));
}

/**
 * @returns A string representation of the object.
 *
 * The algorithm used:
 *
 * - is NOT cryptographically secure;
 * - is fast;
 * - produces a consistent hash for the same object structure and content;
 * - is collision-resistant;
 * - is suitable for generating unique identifiers for objects.
 *
 * The algorithm was chosen among several candidates that you can benchmark running `npm run bench:hash`.
 *
 * We chose sha256 because:
 *
 * - it is available in Node.js core without any external dependencies;
 * - it is the fastest (together with sha1) with large payloads - a good approximation of real-world usage;
 * - it is more collision-resistant than sha1, which is important for generating unique identifiers.
 */
export function hashObject(obj: unknown): string {
    const str = stringifyObject(obj);
    return createHash('sha256').update(str).digest('hex');
}
