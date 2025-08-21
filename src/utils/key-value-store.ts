import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

import type { OpenStorageOptions } from 'apify';
import { Actor, KeyValueStore } from 'apify';
import type { StorageClient } from 'crawlee';

function encrypt(dataToEncrypt: unknown, cryptSecret: string): string {
    const iv = randomBytes(16);
    const key = new Uint8Array(Buffer.from(cryptSecret));
    const cipher = createCipheriv('aes-256-cbc', key, new Uint8Array(iv));

    const inputBuffer = new Uint8Array(Buffer.from(JSON.stringify(dataToEncrypt)));
    const updateResult = cipher.update(inputBuffer);
    const finalResult = cipher.final();

    // Combine the results
    const encrypted = new Uint8Array(updateResult.length + finalResult.length);
    encrypted.set(updateResult, 0);
    encrypted.set(finalResult, updateResult.length);

    const result = {
        data: Buffer.from(encrypted).toString('base64'),
        iv: iv.toString('base64'),
    };

    return Buffer.from(JSON.stringify(result)).toString('base64');
}

function decrypt<T>(dataToDecrypt: string, cryptSecret: string): T {
    const { data, iv } = JSON.parse(Buffer.from(dataToDecrypt, 'base64').toString());

    const key = new Uint8Array(Buffer.from(cryptSecret));
    const ivBuffer = new Uint8Array(Buffer.from(iv, 'base64'));
    const decipher = createDecipheriv('aes-256-cbc', key, ivBuffer);

    const encryptedData = new Uint8Array(Buffer.from(data, 'base64'));
    const updateResult = decipher.update(encryptedData);
    const finalResult = decipher.final();

    // Combine the results
    const decrypted = new Uint8Array(updateResult.length + finalResult.length);
    decrypted.set(updateResult, 0);
    decrypted.set(finalResult, updateResult.length);

    return JSON.parse(Buffer.from(decrypted).toString()) as T;
}

class EncryptedKeyValueStore extends KeyValueStore {
    private cryptSecret: string;
    protected kvStore: KeyValueStore;

    /**
     * `kvStore` and `storageClient` should be coherent: for this reason, only `openEncryptedKeyValueStore` is exported.
     */
    constructor(kvStore: KeyValueStore, storageClient: StorageClient, encryptionKey: string) {
        super(
            {
                id: kvStore.id,
                name: kvStore.name,
                client: storageClient,
            },
            kvStore.config,
        );
        this.cryptSecret = createHash('sha256').update(encryptionKey).digest('hex').slice(0, 32);
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
            const errorCode = (error as { code?: string })?.code;
            const errorMessage = (error as { message?: string })?.message ?? '';

            // Handle various crypto decryption errors
            if (
                errorCode === 'ERR_OSSL_EVP_BAD_DECRYPT' ||
                errorCode === 'ERR_OSSL_BAD_DECRYPT' ||
                errorMessage.includes('bad decrypt')
            ) {
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
): Promise<EncryptedKeyValueStore> {
    const kvStore = await Actor.openKeyValueStore(storeIdOrName, options);
    const storageClient = Actor.config.getStorageClient();

    return new EncryptedKeyValueStore(kvStore, storageClient, encryptionKey);
}
