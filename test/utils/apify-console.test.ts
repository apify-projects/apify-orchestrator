import { getRunUrl } from 'src/utils/apify-console.js';
import { describe, expect, it } from 'vitest';

describe('utils/apify-console', () => {
    describe('getRunUrl', () => {
        it('returns the correct URL for a given run ID', () => {
            const runId = 'abcd1234';
            const runUrl = getRunUrl(runId);
            expect(runUrl).toContain(runId);
            expect(runUrl).toContain('console.apify.com');
        });
    });
});
