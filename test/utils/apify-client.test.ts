import { isRunFailStatus, isRunOkStatus } from 'src/utils/apify-client.js';

describe('utils/apify-client', () => {
    describe('isRunOkStatus', () => {
        it('correctly identifies OK statuses', () => {
            const okStatuses = ['READY', 'RUNNING', 'SUCCEEDED'];
            for (const status of okStatuses) {
                expect(isRunOkStatus(status)).toBe(true);
            }
        });

        it('correctly identifies non-OK statuses', () => {
            const nonOkStatuses = ['FAILED', 'ABORTING', 'ABORTED', 'TIMING-OUT', 'TIMED-OUT', 'UNKNOWN'];
            for (const status of nonOkStatuses) {
                expect(isRunOkStatus(status)).toBe(false);
            }
        });
    });

    describe('isRunFailStatus', () => {
        it('correctly identifies FAIL statuses', () => {
            const failStatuses = ['FAILED', 'ABORTING', 'ABORTED', 'TIMING-OUT', 'TIMED-OUT'];
            for (const status of failStatuses) {
                expect(isRunFailStatus(status)).toBe(true);
            }
        });

        it('correctly identifies non-FAIL statuses', () => {
            const nonFailStatuses = ['READY', 'RUNNING', 'SUCCEEDED', 'UNKNOWN'];
            for (const status of nonFailStatuses) {
                expect(isRunFailStatus(status)).toBe(false);
            }
        });
    });
});
