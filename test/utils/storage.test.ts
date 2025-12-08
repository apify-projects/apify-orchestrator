import { Actor } from 'apify';
import { EncryptedKeyValueStore } from 'src/utils/key-value-store.js';
import { buildLogger } from 'src/utils/logging.js';
import { buildStorage } from 'src/utils/storage.js';
import { getTestOptions } from 'test/_helpers/context.js';
import { describe, expect, it, vi } from 'vitest';

vi.mock('apify');

vi.mock('src/utils/key-value-store.js');

const encryptedKeyValueStoreMock = {
    useState: vi.fn(),
} as unknown as EncryptedKeyValueStore;
// eslint-disable-next-line prefer-arrow-callback
vi.mocked(EncryptedKeyValueStore).mockImplementation(function () {
    return encryptedKeyValueStoreMock;
});

describe('buildStorage', () => {
    const logger = buildLogger(getTestOptions());

    it('returns undefined when persistenceSupport is none', () => {
        const options = getTestOptions({ persistenceSupport: 'none' });
        const storage = buildStorage(logger, options);
        expect(storage).toBeUndefined();
    });

    it('returns unencrypted storage when no encryption key is provided', async () => {
        const options = getTestOptions({
            persistenceSupport: 'kvs',
            persistencePrefix: 'test-prefix-',
            persistenceEncryptionKey: undefined,
        });
        const storage = buildStorage(logger, options);
        expect(storage).toBeDefined();
        await storage.useState('test-key', { foo: 'bar' });
        expect(Actor.useState).toHaveBeenCalledWith('test-prefix-test-key', { foo: 'bar' });
    });

    it('returns encrypted storage when encryption key is provided', async () => {
        const options = getTestOptions({
            persistenceSupport: 'kvs',
            persistencePrefix: 'test-prefix-',
            persistenceEncryptionKey: 'my-secret-key',
        });
        const storage = buildStorage(logger, options);
        expect(storage).toBeDefined();
        await storage.useState('test-key', { foo: 'bar' });
        expect(encryptedKeyValueStoreMock.useState).toHaveBeenCalledWith('test-prefix-test-key', { foo: 'bar' });
    });
});
