import { Actor, log } from 'apify';

function getNumber(data: unknown, ...path: string[]): number {
    let value = data;
    for (const step of path) {
        if (typeof value === 'object' && value !== null) {
            value = (value as Record<string, unknown>)[step];
        }
    }
    const parsed = Number(value);
    if (Number.isNaN(parsed)) {
        throw new Error(`Item is not a number. Data: ${data}. Path: ${path}.`);
    }
    return parsed;
}

interface UserLimits {
    currentMemoryUsageGBs: number;
    maxMemoryGBs: number;
    activeActorJobCount: number;
    maxConcurrentActorJobs: number;
}

export async function getUserLimits(apifyToken?: string): Promise<UserLimits> {
    try {
        const url = `https://api.apify.com/v2/users/me/limits?token=${apifyToken || Actor.getEnv().token}`;
        const res = await fetch(url);
        const { data } = await res.json();
        const currentMemoryUsageGBs = getNumber(data, 'current', 'actorMemoryGbytes');
        const maxMemoryGBs = getNumber(data, 'limits', 'maxActorMemoryGbytes');
        const activeActorJobCount = getNumber(data, 'current', 'activeActorJobCount');
        const maxConcurrentActorJobs = getNumber(data, 'limits', 'maxConcurrentActorJobs');
        return { currentMemoryUsageGBs, maxMemoryGBs, activeActorJobCount, maxConcurrentActorJobs };
    } catch (err) {
        log.exception(err as Error, 'Could not fetch user limits from Apify API. Not starting new runs.');
        return {
            currentMemoryUsageGBs: Number.POSITIVE_INFINITY,
            maxMemoryGBs: Number.POSITIVE_INFINITY,
            activeActorJobCount: Number.POSITIVE_INFINITY,
            maxConcurrentActorJobs: Number.POSITIVE_INFINITY,
        };
    }
}
