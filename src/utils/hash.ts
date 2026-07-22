import { murmur3 } from 'murmurhash-js';

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

export function hashObject(obj: unknown): string {
    const str = stringifyObject(obj);
    return murmur3(str).toString(16);
}
