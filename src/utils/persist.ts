import { Actor } from 'apify';

type Updater<T> = T | ((prev: T) => T)

function isCallback<T>(maybeFunction: Updater<T>): maybeFunction is ((prev: T) => T) {
    return typeof maybeFunction === 'function';
}

export type PersistSupport = 'kvs' | 'none'

interface KvsState<T> {
    value: T
    update: (upd: Updater<T>) => Promise<void>
}

/**
 * Creates a state which can be immediately persisted on the KeyValueStore, without waiting for an event.
 *
 * Call `update` to change the value.
 *
 * @param key the KVS key
 * @param defaultValue applied if no previous value is found in the KVS
 * @param persistSupport either `kvs`, to persist the value on the KeyValueStore, or `none`
 * @returns the state object
 */
export async function state<T>(
    key: string,
    defaultValue: T,
    persistSupport: PersistSupport = 'none',
): Promise<KvsState<T>> {
    let value = defaultValue;

    if (persistSupport === 'kvs') {
        const storedValue = await Actor.getValue<T>(key);
        if (storedValue) value = storedValue;
        else {
            await Actor.setValue(key, value);
        }
    }

    return {
        get value() { return value; },
        update: async (upd: Updater<T>) => {
            if (isCallback(upd)) value = upd(value);
            else value = upd;
            if (persistSupport === 'kvs') {
                await Actor.setValue(key, value);
            }
        },
    };
}
