import { Actor } from 'apify';
import type { Dictionary } from 'crawlee';

import type { OrchestratorOptions } from '../types.js';
import type { EncryptionKey } from './encryption.js';
import { processEncryptionKey } from './encryption.js';
import { EncryptedKeyValueStore } from './key-value-store.js';
import type { Logger } from './logging.js';

export interface Storage {
    useState<T extends Dictionary>(key: string, defaultValue: T): Promise<T>;
}

export function buildStorage(logger: Logger, options: OrchestratorOptions): Storage | undefined {
    const { persistenceSupport, persistencePrefix, persistenceEncryptionKey } = options;

    if (persistenceSupport === 'none') {
        return undefined;
    }

    if (persistenceEncryptionKey) {
        const encryptionKey = processEncryptionKey(persistenceEncryptionKey);
        return buildEncryptedStorage(logger, persistencePrefix, encryptionKey);
    }

    return buildUnencryptedStorage(persistencePrefix);
}

function buildEncryptedStorage(logger: Logger, persistencePrefix: string, encryptionKey: EncryptionKey): Storage {
    const encryptedKeyValueStore = new EncryptedKeyValueStore(logger, encryptionKey);

    return {
        useState: async <T extends Dictionary>(key: string, defaultValue: T): Promise<T> => {
            return encryptedKeyValueStore.useState<T>(`${persistencePrefix}${key}`, defaultValue);
        },
    };
}

function buildUnencryptedStorage(persistencePrefix: string): Storage {
    return {
        useState: async <T extends Dictionary>(key: string, defaultValue: T): Promise<T> => {
            return Actor.useState<T>(`${persistencePrefix}${key}`, defaultValue);
        },
    };
}
