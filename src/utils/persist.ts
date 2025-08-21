import type { KeyValueStore } from 'apify';
import { Actor } from 'apify';

import type { PersistenceSupport } from '../types.js';
import { openEncryptedKeyValueStore } from './key-value-store.js';

type Updater<T> = T | ((prev: T) => T);

function isCallback<T>(maybeFunction: Updater<T>): maybeFunction is (prev: T) => T {
    return typeof maybeFunction === 'function';
}

export class State<T> {
    protected key: string | undefined;
    protected kvStore: KeyValueStore | undefined;

    protected memoryValue: T;

    constructor(defaultValue: T) {
        this.memoryValue = defaultValue;
    }

    /**
     * @returns the exit of the sync operation.
     */
    async sync(key: string, persistenceSupport: PersistenceSupport = 'none', encryptionKey?: string): Promise<boolean> {
        this.key = key;
        if (persistenceSupport === 'none') {
            return true;
        }
        const kvStore = encryptionKey
            ? await openEncryptedKeyValueStore(encryptionKey)
            : await Actor.openKeyValueStore();
        this.kvStore = kvStore;
        try {
            const storedValue = await kvStore.getValue<T>(this.key);
            if (storedValue) {
                this.memoryValue = storedValue;
            } else {
                await kvStore.setValue(this.key, this.memoryValue);
            }
            return true;
        } catch {
            await kvStore.setValue(this.key, this.memoryValue);
            return false;
        }
    }

    get value() {
        return this.memoryValue;
    }

    async update(upd: Updater<T>) {
        if (isCallback(upd)) this.memoryValue = upd(this.memoryValue);
        else this.memoryValue = upd;
        if (this.key && this.kvStore) {
            await this.kvStore.setValue(this.key, this.memoryValue);
        }
    }
}
