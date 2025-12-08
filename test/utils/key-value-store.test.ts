import { Actor, KeyValueStore } from 'apify';
import { encryptString, processEncryptionKey } from 'src/utils/encryption.js';
import { EncryptedKeyValueStore } from 'src/utils/key-value-store.js';
import { buildLogger } from 'src/utils/logging.js';
import { getTestOptions } from 'test/_helpers/context.js';
import { describe, expect, it, vi } from 'vitest';

describe('EncryptedKeyValueStore', () => {
    const options = getTestOptions();
    const logger = buildLogger(options);

    const secret = 'test-encryption-key';
    const encryptionKey = processEncryptionKey(secret);

    describe('useState', () => {
        it('restores state correctly', async () => {
            const testValue = { counter: 42 };

            const getValueSpy = vi
                .spyOn(KeyValueStore.prototype, 'getValue')
                .mockResolvedValue(encryptString(JSON.stringify(testValue), encryptionKey));

            const kvs = new EncryptedKeyValueStore(logger, encryptionKey);
            const testKey = 'TEST_KEY';

            const state = await kvs.useState<{ counter: number }>(testKey, { counter: 0 });
            expect(getValueSpy).toHaveBeenCalledWith(testKey);
            expect(state).toEqual(testValue);
        });

        it('returns default value when key does not exist', async () => {
            const getValueSpy = vi.spyOn(KeyValueStore.prototype, 'getValue').mockResolvedValue(null);

            const kvs = new EncryptedKeyValueStore(logger, encryptionKey);
            const testKey = 'NON_EXISTENT_KEY';
            const defaultValue = { message: 'Hello, World!' };

            const state = await kvs.useState<typeof defaultValue>(testKey, defaultValue);
            expect(getValueSpy).toHaveBeenCalledWith(testKey);
            expect(state).toEqual(defaultValue);
        });

        it('returns the default value if the decryption fails', async () => {
            const anotherEncryptionKey = processEncryptionKey('another-encryption-key');
            const invalidEncryptedData = encryptString(JSON.stringify({ data: 'test' }), anotherEncryptionKey);

            const getValueSpy = vi.spyOn(KeyValueStore.prototype, 'getValue').mockResolvedValue(invalidEncryptedData);

            const kvs = new EncryptedKeyValueStore(logger, encryptionKey);
            const testKey = 'INVALID_ENCRYPTED_KEY';
            const defaultValue = { message: 'Hello, World!' };

            const state = await kvs.useState<typeof defaultValue>(testKey, defaultValue);
            expect(getValueSpy).toHaveBeenCalledWith(testKey);
            expect(state).toEqual(defaultValue);
        });

        it('returns the cached value on subsequent calls', async () => {
            const testValue = { counter: 100 };
            const testKey = 'CACHED_KEY';

            const kvs = new EncryptedKeyValueStore(logger, encryptionKey);

            const state1 = await kvs.useState(testKey, testValue);

            state1.counter += 1;

            const state2 = await kvs.useState(testKey, { counter: 0 });
            expect(state2).toEqual({ counter: 101 });
        });

        it('persists state on corresponding event', async () => {
            const testValue = { counter: 7 };
            const testKey = 'PERSIST_KEY';

            const setValueSpy = vi.spyOn(KeyValueStore.prototype, 'setValue');

            let persistCallback: () => Promise<void>;

            const onSpy = vi.spyOn(Actor, 'on').mockImplementationOnce((_event, callback) => {
                persistCallback = callback as () => Promise<void>;
            });

            const kvs = new EncryptedKeyValueStore(logger, encryptionKey);

            expect(onSpy).toHaveBeenCalledWith('persistState', expect.any(Function));

            await kvs.useState(testKey, testValue);

            await persistCallback();

            expect(setValueSpy).toHaveBeenCalledWith(
                testKey,
                expect.any(String),
                expect.objectContaining({
                    timeoutSecs: expect.any(Number),
                }),
            );
        });
    });
});
