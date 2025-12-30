import { log } from 'apify';
import { buildLogger } from 'src/utils/logging.js';
import { getTestOptions } from 'test/_helpers/context.js';

vi.mock('apify', async (importActual) => {
    // eslint-disable-next-line @typescript-eslint/consistent-type-imports
    const actual = await importActual<typeof import('apify')>();

    const debugMock = vi.fn<typeof actual.Log.prototype.debug>();
    const infoMock = vi.fn<typeof actual.Log.prototype.info>();
    const warningMock = vi.fn<typeof actual.Log.prototype.warning>();
    const errorMock = vi.fn<typeof actual.Log.prototype.error>();
    const childMock = vi.fn<typeof actual.Log.prototype.child>();

    class MockLog extends actual.Log {}

    Object.assign(MockLog.prototype, {
        debug: debugMock,
        info: infoMock,
        warning: warningMock,
        error: errorMock,
        child: childMock,
    });

    return {
        ...actual,
        Log: MockLog,
    };
});

describe('logging utils', () => {
    afterEach(() => {
        vi.clearAllMocks();
    });

    describe('Logger', () => {
        describe('prefixed', () => {
            it('creates a child logger with the correct prefix', () => {
                const childSpy = vi.spyOn(log, 'child');
                buildLogger(getTestOptions({ enableLogs: true, hideSensitiveInformation: false })).prefixed('test');
                expect(childSpy).toHaveBeenLastCalledWith({ prefix: '[test]' });
            });
        });

        describe('debug', () => {
            it('logs debug messages when enabled', () => {
                const debugSpy = vi.spyOn(log, 'debug');
                const logger = buildLogger(getTestOptions({ enableLogs: true, hideSensitiveInformation: false }));
                logger.debug('test');
                expect(debugSpy).toHaveBeenLastCalledWith('test', undefined);
            });

            it('does not log debug messages when disabled', () => {
                const debugSpy = vi.spyOn(log, 'debug');
                const logger = buildLogger(getTestOptions({ enableLogs: false, hideSensitiveInformation: false }));
                logger.debug('test');
                expect(debugSpy).not.toHaveBeenCalled();
            });

            it('shows sensitive data when not hidden', () => {
                const debugSpy = vi.spyOn(log, 'debug');
                const logger = buildLogger(getTestOptions({ enableLogs: true, hideSensitiveInformation: false }));
                logger.debug('test', undefined, { secret: 'data' });
                expect(debugSpy).toHaveBeenLastCalledWith('test', { secret: 'data' });
            });

            it('hides sensitive data when required', () => {
                const debugSpy = vi.spyOn(log, 'debug');
                const logger = buildLogger(getTestOptions({ enableLogs: true, hideSensitiveInformation: true }));
                logger.debug('test', undefined, { secret: 'data' });
                expect(debugSpy).toHaveBeenLastCalledWith('test', undefined);
            });

            it('handles null data correctly', () => {
                const debugSpy = vi.spyOn(log, 'debug');
                const logger = buildLogger(getTestOptions({ enableLogs: true, hideSensitiveInformation: false }));
                logger.debug('test', null, { secret: 'data' });
                expect(debugSpy).toHaveBeenLastCalledWith('test', { secret: 'data' });
            });

            it('handles null sensitive data correctly', () => {
                const debugSpy = vi.spyOn(log, 'debug');
                const logger = buildLogger(getTestOptions({ enableLogs: true, hideSensitiveInformation: false }));
                logger.debug('test', { info: 'data' }, null);
                expect(debugSpy).toHaveBeenLastCalledWith('test', { info: 'data' });
            });

            it('handles both data and sensitive data being null correctly', () => {
                const debugSpy = vi.spyOn(log, 'debug');
                const logger = buildLogger(getTestOptions({ enableLogs: true, hideSensitiveInformation: false }));
                logger.debug('test', null, null);
                expect(debugSpy).toHaveBeenLastCalledWith('test', undefined);
            });
        });

        describe('info', () => {
            it('logs info messages when enabled', () => {
                const infoSpy = vi.spyOn(log, 'info');
                const logger = buildLogger(getTestOptions({ enableLogs: true, hideSensitiveInformation: false }));
                logger.info('test');
                expect(infoSpy).toHaveBeenLastCalledWith('test', undefined);
            });

            it('does not log info messages when disabled', () => {
                const infoSpy = vi.spyOn(log, 'info');
                const logger = buildLogger(getTestOptions({ enableLogs: false, hideSensitiveInformation: false }));
                logger.info('test');
                expect(infoSpy).not.toHaveBeenCalled();
            });

            it('shows sensitive data when not hidden', () => {
                const infoSpy = vi.spyOn(log, 'info');
                const logger = buildLogger(getTestOptions({ enableLogs: true, hideSensitiveInformation: false }));
                logger.info('test', undefined, { secret: 'data' });
                expect(infoSpy).toHaveBeenLastCalledWith('test', { secret: 'data' });
            });

            it('hides sensitive data when required', () => {
                const infoSpy = vi.spyOn(log, 'info');
                const logger = buildLogger(getTestOptions({ enableLogs: true, hideSensitiveInformation: true }));
                logger.info('test', undefined, { secret: 'data' });
                expect(infoSpy).toHaveBeenLastCalledWith('test', undefined);
            });
        });

        describe('warning', () => {
            it('logs warning messages when enabled', () => {
                const warningSpy = vi.spyOn(log, 'warning');
                const logger = buildLogger(getTestOptions({ enableLogs: true, hideSensitiveInformation: false }));
                logger.warning('test');
                expect(warningSpy).toHaveBeenLastCalledWith('test', undefined);
            });

            it('does not log warning messages when disabled', () => {
                const warningSpy = vi.spyOn(log, 'warning');
                const logger = buildLogger(getTestOptions({ enableLogs: false, hideSensitiveInformation: false }));
                logger.warning('test');
                expect(warningSpy).not.toHaveBeenCalled();
            });

            it('shows sensitive data when not hidden', () => {
                const warningSpy = vi.spyOn(log, 'warning');
                const logger = buildLogger(getTestOptions({ enableLogs: true, hideSensitiveInformation: false }));
                logger.warning('test', undefined, { secret: 'data' });
                expect(warningSpy).toHaveBeenLastCalledWith('test', { secret: 'data' });
            });

            it('hides sensitive data when required', () => {
                const warningSpy = vi.spyOn(log, 'warning');
                const logger = buildLogger(getTestOptions({ enableLogs: true, hideSensitiveInformation: true }));
                logger.warning('test', undefined, { secret: 'data' });
                expect(warningSpy).toHaveBeenLastCalledWith('test', undefined);
            });
        });

        describe('error', () => {
            it('logs error messages when enabled', () => {
                const errorSpy = vi.spyOn(log, 'error');
                const logger = buildLogger(getTestOptions({ enableLogs: true, hideSensitiveInformation: false }));
                logger.error('test');
                expect(errorSpy).toHaveBeenLastCalledWith('test', undefined);
            });

            it('does not log error messages when disabled', () => {
                const errorSpy = vi.spyOn(log, 'error');
                const logger = buildLogger(getTestOptions({ enableLogs: false, hideSensitiveInformation: false }));
                logger.error('test');
                expect(errorSpy).not.toHaveBeenCalled();
            });

            it('shows sensitive data when not hidden', () => {
                const errorSpy = vi.spyOn(log, 'error');
                const logger = buildLogger(getTestOptions({ enableLogs: true, hideSensitiveInformation: false }));
                logger.error('test', undefined, { secret: 'data' });
                expect(errorSpy).toHaveBeenLastCalledWith('test', { secret: 'data' });
            });

            it('hides sensitive data when required', () => {
                const errorSpy = vi.spyOn(log, 'error');
                const logger = buildLogger(getTestOptions({ enableLogs: true, hideSensitiveInformation: true }));
                logger.error('test', undefined, { secret: 'data' });
                expect(errorSpy).toHaveBeenLastCalledWith('test', undefined);
            });
        });
    });
});
