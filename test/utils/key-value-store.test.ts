import { Actor } from 'apify';
import { openEncryptedKeyValueStore } from 'src/utils/key-value-store.js';

describe('key-value-store utils', () => {
    afterEach(() => {
        vi.resetAllMocks();
    });

    describe('openEncryptedKeyValueStore', () => {
        const key = 'test-key';
        const value = 'test-value';
        const secret = 'test-secret';

        afterEach(async () => {
            await Actor.setValue(key, null);
        });

        it('returns an encrypted KeyValueStore, which works correctly', async () => {
            const openKeyValueStoreSpy = vi.spyOn(Actor, 'openKeyValueStore');
            const encryptedKVS = await openEncryptedKeyValueStore(secret);
            expect(openKeyValueStoreSpy).toHaveBeenCalledTimes(1);
            await encryptedKVS.setValue(key, value);
            const encryptedValue = await Actor.getValue(key);
            expect(encryptedValue).not.toBe(value);
            const decryptedValue = await encryptedKVS.getValue(key);
            expect(decryptedValue).toBe(value);
        });
    });
});
