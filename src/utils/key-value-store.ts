import type { RecordOptions } from 'apify';
import { Actor } from 'apify';
import type { Dictionary } from 'crawlee';

import type { EncryptionKey } from './encryption.js';
import { decryptString, encryptString } from './encryption.js';
import type { Logger } from './logging.js';

export class EncryptedKeyValueStore {
    private readonly cache = new Map<string, Dictionary>();
    private readonly pendingOperations = new Map<string, Promise<Dictionary>>();

    constructor(
        private readonly logger: Logger,
        private readonly encryptionKey: EncryptionKey,
    ) {
        Actor.on('persistState', this.persistCache.bind(this));
    }

    /**
     * Mimics Crawlee's `KeyValueStore.prototype.getAutoSavedValue` method, with encryption support.
     * Reference: https://github.com/apify/crawlee/blob/649e2a4086556a8f9f5410a0253e773443d1060b/packages/core/src/storages/key_value_store.ts#L249
     */
    async useState<T extends Dictionary>(key: string, defaultValue: T): Promise<T> {
        const cachedValue = this.cache.get(key) as T;
        if (cachedValue) return cachedValue;

        const pendingOperation = this.pendingOperations.get(key) as Promise<T> | undefined;
        if (pendingOperation) return await pendingOperation;

        const operation = this.generateAndStoreStateLoadingPromise<T>(key, defaultValue);

        return await operation;
    }

    /**
     * This method is synchronous to avoid race conditions when multiple parts of the code access the pending operation
     * map simultaneously: the promise is created and stored in the map without any awaits in between.
     */
    // eslint-disable-next-line @typescript-eslint/promise-function-async
    private generateAndStoreStateLoadingPromise<T extends Dictionary>(key: string, defaultValue: T): Promise<T> {
        const operation = this.getValue<T>(key, defaultValue)
            .then((value) => {
                this.cache.set(key, value);
                this.pendingOperations.delete(key);
                return value;
            })
            .catch((error) => {
                this.pendingOperations.delete(key);
                throw error;
            });

        this.pendingOperations.set(key, operation);

        return operation;
    }

    private async getValue<T extends Dictionary>(key: string, defaultValue: T): Promise<T> {
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

    private async setValue<T extends Dictionary>(key: string, value: T | null, options?: RecordOptions): Promise<void> {
        if (value === null) {
            return await Actor.setValue(key, null, options);
        }

        const stringifiedValue = JSON.stringify(value);
        const encryptedValue = encryptString(stringifiedValue, this.encryptionKey);
        return await Actor.setValue(key, encryptedValue, options);
    }

    private async persistCache(): Promise<void> {
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
