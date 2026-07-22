import { describe, expect, it } from 'vitest';

import { RunRequestGuard } from './run-request-guard.js';

describe('RunRequestGuard', () => {
    it('starts empty: has not started any request ID', () => {
        const guard = new RunRequestGuard();
        expect(guard.hasStarted('test-request-id')).toBe(false);
    });

    it('reports a request ID as started after marking it', () => {
        const guard = new RunRequestGuard();
        guard.markStarted('test-request-id');
        expect(guard.hasStarted('test-request-id')).toBe(true);
    });

    it('keeps request IDs independent of each other', () => {
        const guard = new RunRequestGuard();
        guard.markStarted('request-a');
        expect(guard.hasStarted('request-a')).toBe(true);
        expect(guard.hasStarted('request-b')).toBe(false);
    });

    it('a fresh instance always starts empty, regardless of other instances', () => {
        const guard1 = new RunRequestGuard();
        guard1.markStarted('test-request-id');

        const guard2 = new RunRequestGuard();
        expect(guard2.hasStarted('test-request-id')).toBe(false);
    });
});
