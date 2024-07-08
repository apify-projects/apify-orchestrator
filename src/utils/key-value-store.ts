import crypto from 'node:crypto';

import { Actor, KeyValueStore, OpenStorageOptions } from 'apify';
import { StorageClient } from 'crawlee';

function encrypt(dataToEncrypt: unknown, cryptSecret: string): string {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(
        'aes-256-cbc',
        Buffer.from(cryptSecret),
        iv,
    );

    const result = {
        data: Buffer.concat([
            cipher.update(Buffer.from(JSON.stringify(dataToEncrypt))),
            cipher.final(),
        ]).toString('base64'),
        iv: iv.toString('base64'),
    };

    return Buffer.from(JSON.stringify(result)).toString('base64');
}

function decrypt<T>(dataToDecrypt: string, cryptSecret: string): T {
    const { data, iv } = JSON.parse(Buffer.from(dataToDecrypt, 'base64').toString());

    const decipher = crypto.createDecipheriv(
        'aes-256-cbc',
        Buffer.from(cryptSecret),
        Buffer.from(iv, 'base64'),
    );
    return JSON.parse(Buffer.concat([
        decipher.update(Buffer.from(data, 'base64')),
        decipher.final(),
    ]).toString()) as T;
}

class EncryptedKeyValueStore extends KeyValueStore {
    private cryptSecret: string;
    protected kvStore: KeyValueStore;

    /**
     * `kvStore` and `storageClient` should be coherent: for this reason, only `openEncryptedKeyValueStore` is exported.
     */
    constructor(kvStore: KeyValueStore, storageClient: StorageClient, encryptionKey: string) {
        super({
            id: kvStore.id,
            name: kvStore.name,
            client: storageClient,
        }, kvStore.config);
        this.cryptSecret = crypto
            .createHash('sha256')
            .update(encryptionKey)
            .digest('hex')
            .slice(0, 32);
        this.kvStore = kvStore;
    }

    override async getValue<T = unknown>(key: string, defaultValue?: T) {
        const encryptedValue = await this.kvStore.getValue<string>(key);

        if (encryptedValue == null) {
            if (defaultValue !== undefined) {
                return defaultValue;
            }
            return null;
        }

        try {
            return decrypt(encryptedValue, this.cryptSecret) as T;
        } catch (error) {
            if ((error as { code?: string })?.code === 'ERR_OSSL_EVP_BAD_DECRYPT') {
                throw new Error(`Unable to decrypt key: "${key}". Possibly the wrong secret key is used?`);
            }
            throw error;
        }
    }

    override async setValue<T>(key: string, value: T | null): Promise<void> {
        if (value === null) {
            return await this.kvStore.setValue(key, null);
        }
        return await this.kvStore.setValue(key, encrypt(value, this.cryptSecret));
    }
}

/**
 * @param encryptionKey the key to use to read and write encrypted values.
 * @param storeIdOrName ID or name of the key-value store to be opened.
 * If null or undefined, the function returns the default key-value store associated with the Actor run.
 * @param options
 * @returns an instance of the KeyValueStore which allows reading and writing values using encryption.
 */
export async function openEncryptedKeyValueStore(
    encryptionKey: string,
    storeIdOrName?: string,
    options?: OpenStorageOptions,
) {
    const kvStore = await Actor.openKeyValueStore(storeIdOrName, options);
    const storageClient = Actor.config.getStorageClient();

    return new EncryptedKeyValueStore(kvStore, storageClient, encryptionKey);
}
