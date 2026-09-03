import { isRunFailStatus, isRunOkStatus, isRunTerminalStatus } from 'src/utils/apify-client.js';

describe('utils/apify-client', () => {
    // getStartRunErrorType is tested in run-source.test.ts

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

    describe('isRunTerminalStatus', () => {
        it('correctly identifies terminal statuses', () => {
            const terminalStatuses = ['SUCCEEDED', 'FAILED', 'ABORTED', 'TIMED-OUT'];
            for (const status of terminalStatuses) {
                expect(isRunTerminalStatus(status)).toBe(true);
            }
        });

        it('does not consider a Run which is still taking up resources as terminal', () => {
            const nonTerminalStatuses = ['READY', 'RUNNING', 'ABORTING', 'TIMING-OUT'];
            for (const status of nonTerminalStatuses) {
                expect(isRunTerminalStatus(status)).toBe(false);
            }
        });

        it('does not consider an unknown status as terminal', () => {
            expect(isRunTerminalStatus('UNKNOWN')).toBe(false);
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
