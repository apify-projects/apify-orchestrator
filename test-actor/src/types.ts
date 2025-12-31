import type { DatasetItem } from './orchestrator/types.js';

export interface Input {
    role: 'root' | 'child';
    numberOfChildren?: number;
    childMemoryMbytes?: number;
    childTaskId?: string;
    orchestratorOptions?: Record<string, unknown>;
    waitSeconds?: number;
    childWaitSeconds?: number;
}

export interface Output extends DatasetItem {
    randomNumber: number;
}
