import { Actor } from 'apify';

export type DatasetItem = Record<string, unknown>

// FIXME: type copied from SDK
interface PaginatedList<T> {
    total: number;
    count: number;
    offset: number;
    limit: number;
    desc: boolean;
    items: T[];
}

// FIXME: type copied from SDK
interface DatasetClientListItemOptions {
    clean?: boolean;
    desc?: boolean;
    flatten?: string[];
    fields?: string[];
    omit?: string[];
    // Remove the following properties, which are managed by the utility
    // limit?: number;
    // offset?: number;
    skipEmpty?: boolean;
    skipHidden?: boolean;
    unwind?: string;
    view?: string;
}

/**
 * Iterates over a dataset's items using pagination, according to a given page size.
 * The page size should be tuned according to the average item size and the memory constraints.
 *
 * Allows to prevent errors such as:
 *
 * ```
 * Error: Cannot create a string longer than 0x1fffffe8 characters
 * ```
 *
 * @param datasetId the dataset ID
 * @param fields the fields to load from the dataset
 * @param pageSize the size used for pagination
 */
export async function* iteratePaginatedDataset<T extends DatasetItem>(
    datasetId: string,
    pageSize: number,
    options?: DatasetClientListItemOptions,
): AsyncGenerator<T, void, void> {
    const dataset = Actor.apifyClient.dataset<T>(datasetId);

    let offset = 0;
    let currentPage: PaginatedList<T> | undefined = await dataset.listItems({ ...options, offset, limit: pageSize });
    while (currentPage.items.length > 0) {
        for (const item of currentPage.items) {
            yield item;
        }

        offset += pageSize;
        currentPage = await dataset.listItems({ offset, limit: pageSize });
    }
}
