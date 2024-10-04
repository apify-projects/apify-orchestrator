import { DatasetItem, ExtendedDatasetClient, IterateOptions, DatasetGroup } from '../types.js';

export class DatasetGroupClass<T extends DatasetItem> implements DatasetGroup<T> {
    readonly datasets: ExtendedDatasetClient<T>[];

    constructor(...datasets: ExtendedDatasetClient<T>[]) {
        this.datasets = datasets;
    }

    async* iterate(options: IterateOptions): AsyncGenerator<T, void, void> {
        for (const dataset of this.datasets) {
            const datasetIterator = dataset.iterate(options);
            for await (const item of datasetIterator) {
                yield item;
            }
        }
    }
}
