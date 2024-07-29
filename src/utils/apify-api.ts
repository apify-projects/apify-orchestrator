import { Actor, log } from 'apify';

export async function getAvailableMemoryGBs(apifyToken?: string): Promise<number> {
    try {
        const url = `https://api.apify.com/v2/users/me/limits?token=${apifyToken || Actor.getEnv().token}`;
        const res = await fetch(url);
        const { data } = await res.json();
        const { limits, current } = data;
        const { maxActorMemoryGbytes } = limits;
        const { actorMemoryGbytes } = current;
        return maxActorMemoryGbytes - actorMemoryGbytes;
    } catch (err) {
        log.exception(err as Error, 'Could not fetch available memory from Apify API. Not starting new runs.');
        return 0;
    }
}
