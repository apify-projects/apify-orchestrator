import { DatasetClient, DatasetClientListItemOptions } from 'apify-client';

import { DatasetItem } from '../types.js';

export class IterableDatasetClient<T extends DatasetItem> extends DatasetClient<T> {
    async* iteratePaginated(
        pageSize: number,
        readOptions?: DatasetClientListItemOptions,
    ): AsyncGenerator<T, void, void> {
        let offset = 0;
        let currentPage = await this.listItems({ ...readOptions, offset, limit: pageSize });
        while (currentPage.items.length > 0) {
            for (const item of currentPage.items) {
                yield item;
            }

            offset += pageSize;
            currentPage = await this.listItems({ offset, limit: pageSize });
        }
    }
}
