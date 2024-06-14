import { log } from 'apify';

// FIXME: type copied from SDK
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AdditionalData = Record<string, any> | null

type RegLogFn = (msg: string, data?: AdditionalData) => void

interface RegLogger {
    debug: RegLogFn
    info: RegLogFn
    warning: RegLogFn
    error: RegLogFn
}

type PrfxLogFn = (prefix: string, msg: string, data?: AdditionalData) => void

interface PrfxLogger {
    prfxDebug: PrfxLogFn
    prfxInfo: PrfxLogFn
    prfxWarn: PrfxLogFn
    prfxError: PrfxLogFn
}

export type CustomLogger = RegLogger & PrfxLogger

const regLog: RegLogger = {
    debug: (msg: string, data?: AdditionalData) => { log.debug(msg, data); },
    info: (msg: string, data?: AdditionalData) => { log.info(msg, data); },
    warning: (msg: string, data?: AdditionalData) => { log.warning(msg, data); },
    error: (msg: string, data?: AdditionalData) => { log.error(msg, data); },
};

const prefixMessage = (prefix: string, msg: string) => `[${prefix}] ${msg}`;

/**
 * This is a wrapper for `apify.log` which requires passing an `id`, that is logged before the message.
 *
 * The ID is useful to quickly distinguish logs from different functions, which are executed in parallel.
 */
const prfxLog: PrfxLogger = {
    prfxDebug: (prefix: string, msg: string, data?: AdditionalData) => { log.debug(prefixMessage(prefix, msg), data); },
    prfxInfo: (prefix: string, msg: string, data?: AdditionalData) => { log.info(prefixMessage(prefix, msg), data); },
    prfxWarn: (prefix: string, msg: string, data?: AdditionalData) => { log.warning(prefixMessage(prefix, msg), data); },
    prfxError: (prefix: string, msg: string, data?: AdditionalData) => { log.error(prefixMessage(prefix, msg), data); },
};

export function getLogger(enabled: boolean): CustomLogger {
    if (!enabled) {
        return {
            debug: () => {},
            info: () => {},
            warning: () => {},
            error: () => {},
            prfxDebug: () => {},
            prfxInfo: () => {},
            prfxWarn: () => {},
            prfxError: () => {},
        };
    }

    return { ...regLog, ...prfxLog };
}
