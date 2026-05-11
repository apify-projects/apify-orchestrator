import { murmur3 } from 'murmurhash-js';

function stringifyObject(obj: unknown): string {
    return JSON.stringify(
        obj,
        Object.keys(obj as object).sort((a, b) => a.localeCompare(b)),
    );
}

export function hashObject(obj: unknown): string {
    const str = stringifyObject(obj);
    return murmur3(str).toString(16);
}
