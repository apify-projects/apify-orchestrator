import type { DatasetItem } from '../types.js';

export interface Input {
    role: 'e2e-test' | 'resurrection-test' | 'child';
    orchestratorOptions?: Record<string, unknown>;
    waitSeconds?: number;
    numberToOutput?: number;
    /**
     * How many items the child Run should push to its default dataset, one at a time.
     *
     * @default 1
     */
    itemsToOutput?: number;
}

export interface Output extends DatasetItem {
    value: number;
}

export interface TestResult {
    success: boolean;
    details?: string;
}
