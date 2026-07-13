import type { DatasetItem } from '../types.js';

export interface Input {
    role: 'e2e-test' | 'resurrection-test' | 'child';
    orchestratorOptions?: Record<string, unknown>;
    waitSeconds?: number;
    numbersToOutput?: number[];
    outputIntervalSecs?: number;
}

export interface Output extends DatasetItem {
    value: number;
}

export interface TestResult {
    success: boolean;
    details?: string;
}
