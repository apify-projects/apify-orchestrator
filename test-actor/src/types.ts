import type { DatasetItem } from './orchestrator/types.js';

export interface Input {
    role: 'root' | 'child' | 'e2e-test';
    numberOfChildren?: number;
    childMemoryMbytes?: number;
    childTaskId?: string;
    orchestratorOptions?: Record<string, unknown>;
    waitSeconds?: number;
    childWaitSeconds?: number;
    numberToOutput?: number;
}

export interface Output extends DatasetItem {
    value: number;
}
