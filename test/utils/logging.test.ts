import { log } from 'apify';
import { CustomLogger } from 'src/utils/logging.js';

describe('logging utils', () => {
    describe('CustomLogger', () => {
        afterEach(() => {
            vi.resetAllMocks();
        });

        it('logs when enabled', () => {
            const infoSpy = vi.spyOn(log, 'info');
            const logger = new CustomLogger(true, false);
            logger.info('test');
            expect(infoSpy).toHaveBeenCalledTimes(1);
        });

        it('does not log when disabled', () => {
            const infoSpy = vi.spyOn(log, 'info');
            const logger = new CustomLogger(false, false);
            logger.info('test');
            expect(infoSpy).not.toHaveBeenCalled();
        });

        it('hides sensible information when required', () => {
            const infoSpy = vi.spyOn(log, 'info');
            const logger = new CustomLogger(true, true);
            logger.info('test', undefined, { hidden: 'msg' });
            expect(infoSpy).toHaveBeenCalledWith('test', undefined);
        });

        it('does not hide sensible information when it is not required', () => {
            const infoSpy = vi.spyOn(log, 'info');
            const logger = new CustomLogger(true, false);
            logger.info('test', undefined, { hidden: 'msg' });
            expect(infoSpy).toHaveBeenCalledWith('test', { hidden: 'msg' });
        });

        it('performs regular and prefixed logs correctly', () => {
            const debugSpy = vi.spyOn(log, 'debug');
            const infoSpy = vi.spyOn(log, 'info');
            const warnSpy = vi.spyOn(log, 'warning');
            const errorSpy = vi.spyOn(log, 'error');
            const logger = new CustomLogger(true, false);

            logger.debug('test');
            expect(debugSpy).toHaveBeenLastCalledWith('test', undefined);
            logger.info('test');
            expect(infoSpy).toHaveBeenLastCalledWith('test', undefined);
            logger.warning('test');
            expect(warnSpy).toHaveBeenLastCalledWith('test', undefined);
            logger.error('test');
            expect(errorSpy).toHaveBeenLastCalledWith('test', undefined);

            logger.prfxDebug('me', 'test');
            expect(debugSpy).toHaveBeenLastCalledWith('[me] test', undefined);
            logger.prfxInfo('me', 'test');
            expect(infoSpy).toHaveBeenLastCalledWith('[me] test', undefined);
            logger.prfxWarn('me', 'test');
            expect(warnSpy).toHaveBeenLastCalledWith('[me] test', undefined);
            logger.prfxError('me', 'test');
            expect(errorSpy).toHaveBeenLastCalledWith('[me] test', undefined);
        });
    });
});
