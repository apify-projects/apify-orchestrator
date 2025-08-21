import type { KeyValueStore } from 'apify';
import { Actor } from 'apify';
import type { StorageClient } from 'crawlee';
import { openEncryptedKeyValueStore } from 'src/utils/key-value-store.js';

type EncryptedKeyValueStoreType = Awaited<ReturnType<typeof openEncryptedKeyValueStore>>;

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

    describe('EncryptedKeyValueStore', () => {
        const secret = 'test-encryption-secret';
        const testKey = 'test-key';
        const testValue = { message: 'Hello, World!', number: 42, array: [1, 2, 3] };
        const primitiveValue = 'simple string';

        let encryptedKVS: EncryptedKeyValueStoreType;
        let mockKVStore: {
            id: string;
            name: string;
            config: Record<string, unknown>;
            getValue: ReturnType<typeof vi.fn>;
            setValue: ReturnType<typeof vi.fn>;
        };

        beforeEach(async () => {
            // Create a mock KeyValueStore
            mockKVStore = {
                id: 'mock-kvs-id',
                name: 'mock-kvs-name',
                config: {},
                getValue: vi.fn(),
                setValue: vi.fn(),
            };

            // Mock Actor.openKeyValueStore to return our mock
            vi.spyOn(Actor, 'openKeyValueStore').mockResolvedValue(mockKVStore as unknown as KeyValueStore);

            // Mock Actor.config.getStorageClient with required methods
            const mockStorageClient = {
                keyValueStore: vi.fn().mockReturnValue({
                    // Mock the required methods for KeyValueStore client
                    get: vi.fn(),
                    put: vi.fn(),
                    delete: vi.fn(),
                }),
                // Add other required methods if needed
            } as unknown as StorageClient;
            vi.spyOn(Actor.config, 'getStorageClient').mockReturnValue(mockStorageClient);

            // Create the encrypted KVS
            encryptedKVS = await openEncryptedKeyValueStore(secret);
        });

        afterEach(() => {
            vi.resetAllMocks();
        });

        describe('setValue', () => {
            it('should encrypt values before storing them', async () => {
                await encryptedKVS.setValue(testKey, testValue);

                expect(mockKVStore.setValue).toHaveBeenCalledTimes(1);
                expect(mockKVStore.setValue).toHaveBeenCalledWith(testKey, expect.any(String));

                const [, encryptedValue] = mockKVStore.setValue.mock.calls[0];
                expect(encryptedValue).not.toBe(testValue);
                expect(encryptedValue).not.toContain(testValue.message);
                expect(typeof encryptedValue).toBe('string');
            });

            it('should store null values as null without encryption', async () => {
                await encryptedKVS.setValue(testKey, null);

                expect(mockKVStore.setValue).toHaveBeenCalledTimes(1);
                expect(mockKVStore.setValue).toHaveBeenCalledWith(testKey, null);
            });

            it('should encrypt primitive values correctly', async () => {
                await encryptedKVS.setValue(testKey, primitiveValue);

                expect(mockKVStore.setValue).toHaveBeenCalledTimes(1);
                const [, encryptedValue] = mockKVStore.setValue.mock.calls[0];
                expect(encryptedValue).not.toBe(primitiveValue);
                expect(typeof encryptedValue).toBe('string');
            });
        });

        describe('getValue', () => {
            it('should decrypt values when retrieving them', async () => {
                // First, store an encrypted value
                await encryptedKVS.setValue(testKey, testValue);
                const encryptedValue = mockKVStore.setValue.mock.calls[0][1];

                // Mock the underlying getValue to return the encrypted value
                mockKVStore.getValue.mockResolvedValue(encryptedValue);

                // Retrieve and verify decryption
                const decryptedValue = await encryptedKVS.getValue(testKey);

                expect(mockKVStore.getValue).toHaveBeenCalledTimes(1);
                expect(mockKVStore.getValue).toHaveBeenCalledWith(testKey);
                expect(decryptedValue).toEqual(testValue);
            });

            it('should return null when the stored value is null', async () => {
                mockKVStore.getValue.mockResolvedValue(null);

                const result = await encryptedKVS.getValue(testKey);

                expect(mockKVStore.getValue).toHaveBeenCalledTimes(1);
                expect(result).toBeNull();
            });

            it('should return the default value when stored value is null and default is provided', async () => {
                const defaultValue = { default: 'value' };
                mockKVStore.getValue.mockResolvedValue(null);

                const result = await encryptedKVS.getValue(testKey, defaultValue);

                expect(mockKVStore.getValue).toHaveBeenCalledTimes(1);
                expect(result).toBe(defaultValue);
            });

            it('should return null when stored value is null and no default is provided', async () => {
                mockKVStore.getValue.mockResolvedValue(null);

                const result = await encryptedKVS.getValue(testKey);

                expect(result).toBeNull();
            });

            it('should handle primitive values correctly', async () => {
                // Store a primitive value
                await encryptedKVS.setValue(testKey, primitiveValue);
                const encryptedValue = mockKVStore.setValue.mock.calls[0][1];

                // Mock retrieval
                mockKVStore.getValue.mockResolvedValue(encryptedValue);

                const decryptedValue = await encryptedKVS.getValue(testKey);

                expect(decryptedValue).toBe(primitiveValue);
            });
        });

        describe('error handling', () => {
            it('should throw a descriptive error when decryption fails with wrong key', async () => {
                // Create an encrypted value with one secret
                const anotherSecret = 'different-secret';
                const anotherKVS = await openEncryptedKeyValueStore(anotherSecret);
                await anotherKVS.setValue(testKey, testValue);
                const encryptedWithDifferentKey =
                    mockKVStore.setValue.mock.calls[mockKVStore.setValue.mock.calls.length - 1][1];

                // Try to decrypt with our original secret
                mockKVStore.getValue.mockResolvedValue(encryptedWithDifferentKey);

                await expect(encryptedKVS.getValue(testKey)).rejects.toThrow(
                    `Unable to decrypt key: "${testKey}". Possibly the wrong secret key is used?`,
                );
            });

            it('should re-throw other decryption errors', async () => {
                // Mock an invalid encrypted value that will cause a different error
                mockKVStore.getValue.mockResolvedValue('invalid-encrypted-data');

                await expect(encryptedKVS.getValue(testKey)).rejects.toThrow();
            });
        });

        describe('encryption consistency', () => {
            it('should produce different encrypted values for the same input (due to random IV)', async () => {
                await encryptedKVS.setValue('key1', testValue);
                await encryptedKVS.setValue('key2', testValue);

                const encryptedValue1 = mockKVStore.setValue.mock.calls[0][1];
                const encryptedValue2 = mockKVStore.setValue.mock.calls[1][1];

                // Should be different due to random IV
                expect(encryptedValue1).not.toBe(encryptedValue2);
            });

            it('should consistently decrypt the same encrypted value', async () => {
                await encryptedKVS.setValue(testKey, testValue);
                const encryptedValue = mockKVStore.setValue.mock.calls[0][1];

                // Mock multiple retrievals of the same encrypted value
                mockKVStore.getValue.mockResolvedValue(encryptedValue);

                const result1 = await encryptedKVS.getValue(testKey);
                const result2 = await encryptedKVS.getValue(testKey);

                expect(result1).toEqual(testValue);
                expect(result2).toEqual(testValue);
                expect(result1).toEqual(result2);
            });
        });

        describe('type safety', () => {
            it('should maintain type information through encryption/decryption cycle', async () => {
                const complexObject = {
                    string: 'text',
                    number: 123,
                    boolean: true,
                    array: [1, 'two', { three: 3 }],
                    nested: {
                        deep: {
                            value: 'found',
                        },
                    },
                    nullValue: null as null,
                    undefinedValue: undefined as undefined,
                };

                await encryptedKVS.setValue(testKey, complexObject);
                const encryptedValue = mockKVStore.setValue.mock.calls[0][1];

                mockKVStore.getValue.mockResolvedValue(encryptedValue);
                const decryptedValue = (await encryptedKVS.getValue(testKey)) as typeof complexObject;

                expect(decryptedValue).toEqual(complexObject);
                expect(typeof decryptedValue.string).toBe('string');
                expect(typeof decryptedValue.number).toBe('number');
                expect(typeof decryptedValue.boolean).toBe('boolean');
                expect(Array.isArray(decryptedValue.array)).toBe(true);
                expect(decryptedValue.nested.deep.value).toBe('found');
            });
        });
    });
});
