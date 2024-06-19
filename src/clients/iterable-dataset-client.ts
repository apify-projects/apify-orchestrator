import { DatasetClient, DatasetClientListItemOptions } from 'apify-client';
import { CustomLogger } from 'src/utils/logging.js';

import { DatasetItem } from '../types.js';

export class IterableDatasetClient<T extends DatasetItem> extends DatasetClient<T> {
    protected customLogger: CustomLogger;

    constructor(actorClient: DatasetClient, customLogger: CustomLogger) {
        super({
            baseUrl: actorClient.baseUrl,
            apifyClient: actorClient.apifyClient,
            httpClient: actorClient.httpClient,
            id: actorClient.id,
            params: actorClient.params,
        });
        this.customLogger = customLogger;
    }

    async* iteratePaginated(
        pageSize: number,
        readOptions?: DatasetClientListItemOptions,
    ): AsyncGenerator<T, void, void> {
        this.customLogger.info('Reading paginated Dataset', { pageSize, url: this.url });

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
