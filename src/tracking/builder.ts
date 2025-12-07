import { Actor } from 'apify';
import type { Dictionary } from 'crawlee';
import { EncryptedKeyValueStore } from 'src/utils/key-value-store.js';

import type { OrchestratorOptions } from '../types.js';
import type { GlobalContext } from '../utils/context.js';
import type { EncryptionKey } from '../utils/encryption.js';
import { processEncryptionKey } from '../utils/encryption.js';
import type { CurrentRuns } from './current-run-tracker.js';
import { CurrentRunTracker } from './current-run-tracker.js';
import type { FailedRunsHistory } from './failed-run-history-tracker.js';
import { FailedRunHistoryTracker } from './failed-run-history-tracker.js';
import { RunTracker } from './run-tracker.js';

const RUNS_KEY = 'RUNS';
const FAILED_RUNS_KEY = 'FAILED_RUNS';

export async function buildRunTrackerForOrchestrator(
    context: GlobalContext,
    options: OrchestratorOptions,
): Promise<RunTracker> {
    const storage = await buildStorage(context, options);
    const currentRunTracker = await buildCurrentRunTracker(context, options, storage);
    const failedRunHistoryTracker = await buildFailedRunHistoryTracker(context, options, storage);
    return new RunTracker(context, currentRunTracker, failedRunHistoryTracker);
}

interface Storage {
    useState<T extends Dictionary>(key: string, defaultValue: T): Promise<T>;
}

async function buildStorage(context: GlobalContext, options: OrchestratorOptions): Promise<Storage | undefined> {
    const { persistenceSupport, persistencePrefix, persistenceEncryptionKey } = options;

    if (persistenceSupport === 'none') {
        return undefined;
    }

    if (persistenceEncryptionKey) {
        const encryptionKey = processEncryptionKey(persistenceEncryptionKey);
        return buildEncryptedStorage(context, persistencePrefix, encryptionKey);
    }

    return buildUnencryptedStorage(persistencePrefix);
}

async function buildEncryptedStorage(
    context: GlobalContext,
    persistencePrefix: string,
    encryptionKey: EncryptionKey,
): Promise<Storage> {
    const encryptedKeyValueStore = await EncryptedKeyValueStore.new(context, encryptionKey);

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

async function buildCurrentRunTracker(
    context: GlobalContext,
    options: OrchestratorOptions,
    storage?: Storage,
): Promise<CurrentRunTracker> {
    const currentRuns = (await storage?.useState<CurrentRuns>(RUNS_KEY, {})) ?? {};
    return new CurrentRunTracker(context, currentRuns, options.onUpdate);
}

async function buildFailedRunHistoryTracker(
    context: GlobalContext,
    options: OrchestratorOptions,
    storage?: Storage,
): Promise<FailedRunHistoryTracker | undefined> {
    if (options.hideSensitiveInformation || !storage) {
        return undefined;
    }
    const failedRunsHistory = await storage.useState<FailedRunsHistory>(FAILED_RUNS_KEY, {});
    return new FailedRunHistoryTracker(context, failedRunsHistory);
}
