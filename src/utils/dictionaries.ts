import type { Dictionary } from 'apify-client';

export function mergeDictionaries(
    dict1: Dictionary | undefined,
    dict2: Dictionary | undefined,
): Dictionary | undefined {
    if (dict1 && dict2) return { ...dict1, ...dict2 };
    return dict1 ?? dict2;
}
