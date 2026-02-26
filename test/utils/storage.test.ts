import { Actor } from 'apify';
import { generateOrchestratorContext } from 'src/context/orchestrator-context.js';
import { EncryptedKeyValueStore } from 'src/utils/key-value-store.js';
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
    it('returns undefined when persistenceSupport is none', () => {
        const options = getTestOptions({ persistenceSupport: 'none' });
        const context = generateOrchestratorContext(options);
        const storage = buildStorage(context);
        expect(storage).toBeUndefined();
    });

    it('returns unencrypted storage when no encryption key is provided', async () => {
        const options = getTestOptions({
            persistenceSupport: 'kvs',
            persistenceEncryptionKey: undefined,
        });
        const context = generateOrchestratorContext(options);
        const storage = buildStorage(context);
        expect(storage).toBeDefined();
        await storage.useState('test-key', { foo: 'bar' });
        expect(Actor.useState).toHaveBeenCalledWith('test-key', { foo: 'bar' });
    });

    it('returns encrypted storage when encryption key is provided', async () => {
        const options = getTestOptions({
            persistenceSupport: 'kvs',
            persistenceEncryptionKey: 'my-secret-key',
        });
        const context = generateOrchestratorContext(options);
        const storage = buildStorage(context);
        expect(storage).toBeDefined();
        await storage.useState('test-key', { foo: 'bar' });
        expect(encryptedKeyValueStoreMock.useState).toHaveBeenCalledWith('test-key', { foo: 'bar' });
    });
});
