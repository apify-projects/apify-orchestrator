import { Actor } from 'apify';

/**
 * Run the callback when the Actor's Run is shutting down (migrating, exiting, graceful-aborting).
 */
export function onActorShuttingDown(callback: () => void) {
    Actor.on('migrating', callback);
    Actor.on('exit', callback);
    Actor.on('aborting', callback);
}
