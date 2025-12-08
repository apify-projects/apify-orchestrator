import type { RecordOptions } from 'apify';
import { Actor } from 'apify';
import type { Dictionary } from 'crawlee';

import type { EncryptionKey } from './encryption.js';
import { decryptString, encryptString } from './encryption.js';
import type { Logger } from './logging.js';

export class EncryptedKeyValueStore {
    protected readonly cache = new Map<string, Dictionary>();

    constructor(
        protected readonly logger: Logger,
        protected readonly encryptionKey: EncryptionKey,
    ) {
        Actor.on('persistState', this.persistCache.bind(this));
    }

    /**
     * Mimics Crawlee's `KeyValueStore.prototype.getAutoSavedValue` method, with encryption support.
     * Reference: https://github.com/apify/crawlee/blob/649e2a4086556a8f9f5410a0253e773443d1060b/packages/core/src/storages/key_value_store.ts#L249
     */
    async useState<T extends Dictionary>(key: string, defaultValue: T): Promise<T> {
        let cachedValue = this.cache.get(key) as T;
        if (cachedValue) return cachedValue;

        const value = await this.getValue<T>(key, defaultValue);

        // Check the cache again to avoid creating multiple states for the same key in concurrent scenarios.
        cachedValue = this.cache.get(key) as T;
        if (cachedValue) return cachedValue;

        this.cache.set(key, value);

        return value;
    }

    protected async getValue<T extends Dictionary>(key: string, defaultValue: T): Promise<T> {
        const encryptedValue = await Actor.getValue<string>(key);

        if (encryptedValue == null) {
            return defaultValue;
        }

        try {
            const decryptedValue = decryptString(encryptedValue, this.encryptionKey);
            return JSON.parse(decryptedValue) as T;
        } catch (error) {
            this.logger.error(`Unable to decrypt key: "${key}". Possibly the wrong secret key is used?`, {
                error,
            });
            return defaultValue;
        }
    }

    protected async setValue<T extends Dictionary>(
        key: string,
        value: T | null,
        options?: RecordOptions,
    ): Promise<void> {
        if (value === null) {
            return await Actor.setValue(key, null, options);
        }

        const stringifiedValue = JSON.stringify(value);
        const encryptedValue = encryptString(stringifiedValue, this.encryptionKey);
        return await Actor.setValue(key, encryptedValue, options);
    }

    protected async persistCache(): Promise<void> {
        const persistStateIntervalMs = Actor.config.get('persistStateIntervalMillis');
        const timeoutSecs = persistStateIntervalMs ? persistStateIntervalMs / 1_000 / 2 : undefined;

        const promises: Promise<void>[] = [];

        for (const [key, value] of this.cache) {
            promises.push(
                this.setValue(key, value, {
                    timeoutSecs,
                    doNotRetryTimeouts: true,
                }).catch((error) => this.logger.warning(`Failed to persist the state value to ${key}`, { error })),
            );
        }

        await Promise.all(promises);
    }
}
