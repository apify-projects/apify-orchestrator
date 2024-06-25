import { DatasetClient, DatasetClientListItemOptions } from 'apify-client';
import { CustomLogger } from 'src/utils/logging.js';

import { DatasetItem } from '../types.js';

export type IterateOptions = DatasetClientListItemOptions & {
    pageSize?: number
}

export class IterableDatasetClient<T extends DatasetItem> extends DatasetClient<T> {
    protected customLogger: CustomLogger;
    protected superClient: DatasetClient<T>;

    constructor(datasetClient: DatasetClient<T>, customLogger: CustomLogger) {
        super({
            baseUrl: datasetClient.baseUrl,
            apifyClient: datasetClient.apifyClient,
            httpClient: datasetClient.httpClient,
            id: datasetClient.id,
            params: datasetClient.params,
        });
        this.customLogger = customLogger;
        this.superClient = datasetClient;
    }

    async* iterate(options: IterateOptions = {}): AsyncGenerator<T, void, void> {
        const { pageSize, ...listItemOptions } = options;
        this.customLogger.info('Iterating Dataset', { url: this.url, pageSize });

        let totalItems = 0;

        if (pageSize) {
            let offset = 0;
            let currentPage = await this.superClient.listItems({ ...listItemOptions, offset, limit: pageSize });
            while (currentPage.items.length > 0) {
                totalItems += currentPage.items.length;
                for (const item of currentPage.items) {
                    yield item;
                }

                offset += pageSize;
                currentPage = await this.superClient.listItems({ offset, limit: pageSize });
            }
        } else {
            const itemList = await this.superClient.listItems(listItemOptions);
            totalItems += itemList.items.length;
            for (const item of itemList.items) {
                yield item;
            }
        }

        this.customLogger.info('Finished reading dataset', { totalItems, url: this.url });
    }
}
