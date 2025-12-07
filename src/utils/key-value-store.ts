import type { KeyValueStore, RecordOptions } from 'apify';
import { Actor } from 'apify';
import type { Dictionary } from 'crawlee';

import type { GlobalContext } from './context.js';
import type { EncryptionKey } from './encryption.js';
import { decryptString, encryptString } from './encryption.js';

export class EncryptedKeyValueStore {
    protected readonly cache = new Map<string, Dictionary>();

    protected constructor(
        protected readonly context: GlobalContext,
        protected readonly keyValueStore: KeyValueStore,
        protected readonly encryptionKey: EncryptionKey,
    ) {
        const persistStateIntervalMs = keyValueStore.config.get('persistStateIntervalMillis');
        const timeoutSecs = persistStateIntervalMs ? persistStateIntervalMs / 1_000 / 2 : undefined;

        Actor.on('persistState', async () => {
            const promises: Promise<void>[] = [];

            for (const [key, value] of this.cache) {
                promises.push(
                    this.setValue(key, value, {
                        timeoutSecs,
                        doNotRetryTimeouts: true,
                    }).catch((error) =>
                        this.context.logger.warning(`Failed to persist the state value to ${key}`, { error }),
                    ),
                );
            }

            await Promise.all(promises);
        });
    }

    static async new(context: GlobalContext, encryptionKey: EncryptionKey) {
        const keyValueStore = await Actor.openKeyValueStore();
        return new EncryptedKeyValueStore(context, keyValueStore, encryptionKey);
    }

    async useState<T extends Dictionary>(key: string, defaultValue: T): Promise<T> {
        const cachedValue = this.cache.get(key) as T;
        if (cachedValue) {
            return cachedValue;
        }

        const value = await this.getValue<T>(key, defaultValue);
        this.cache.set(key, value);

        return value;
    }

    protected async getValue<T extends Dictionary>(key: string, defaultValue: T): Promise<T> {
        const encryptedValue = await this.keyValueStore.getValue<string>(key);

        if (encryptedValue == null) {
            return defaultValue;
        }

        try {
            const decryptedValue = decryptString(encryptedValue, this.encryptionKey);
            return JSON.parse(decryptedValue) as T;
        } catch (error) {
            this.context.logger.error(`Unable to decrypt key: "${key}". Possibly the wrong secret key is used?`, {
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
            return await this.keyValueStore.setValue(key, null, options);
        }
        const stringifiedValue = JSON.stringify(value);
        const encryptedValue = encryptString(stringifiedValue, this.encryptionKey);
        return await this.keyValueStore.setValue(key, encryptedValue);
    }
}
