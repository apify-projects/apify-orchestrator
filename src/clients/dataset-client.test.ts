import { afterEach, beforeEach, describe, it, vi } from 'vitest';

import { getClientContext } from '../__unit__/context.js';
import type { DatasetItem } from '../types.js';
import { ExtApifyClient } from './apify-client.js';
import type { ExtDatasetClient } from './dataset-client.js';

interface TestItem extends DatasetItem {
    title: string;
}

describe('ExtDatasetClient', () => {
    let apifyClient: ExtApifyClient;
    let datasetClient: ExtDatasetClient<TestItem>;

    beforeEach(() => {
        const context = getClientContext();
        apifyClient = new ExtApifyClient('test-client', context, {});
        datasetClient = apifyClient.dataset('test-dataset-id');
    });

    afterEach(() => {
        vi.resetAllMocks();
    });

    describe('greedyIterate', () => {
        it('iterates the items from the dataset as soon as one batch is available, using pagination', () => {
            // TODO: test
        });

        it('iterates the items from the dataset as soon as new items are available, setting pageSize to 0', () => {
            // TODO: test
        });
    });
});
