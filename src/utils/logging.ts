import { type Log, log } from 'apify';

type LogData = Record<string, unknown> | null;

type LogMethod = (message: string, data?: LogData, sensitiveData?: LogData) => void;

interface BasicLogger {
    debug: LogMethod;
    info: LogMethod;
    warning: LogMethod;
    error: LogMethod;
}

export interface Logger extends BasicLogger {
    prefixed(prefix: string): BasicLogger;
}

export interface LoggerOptions {
    enableLogs: boolean;
    hideSensitiveInformation: boolean;
}

export const generateLogger = (options: LoggerOptions): Logger => ({
    ...generateBasicLogger(log, options),
    prefixed: (prefix: string) => generateBasicLogger(log.child({ prefix: `[${prefix}]` }), options),
});

function generateBasicLogger(apifyLogger: Log, options: LoggerOptions): BasicLogger {
    if (!options.enableLogs) {
        return {
            debug: noOp,
            info: noOp,
            warning: noOp,
            error: noOp,
        };
    }
    if (options.hideSensitiveInformation) {
        return {
            debug: (message: string, data?: LogData) => apifyLogger.debug(message, data),
            info: (message: string, data?: LogData) => apifyLogger.info(message, data),
            warning: (message: string, data?: LogData) => apifyLogger.warning(message, data),
            error: (message: string, data?: LogData) => apifyLogger.error(message, data),
        };
    }
    return {
        debug: (message: string, data?: LogData, sensitiveData?: LogData) => {
            apifyLogger.debug(message, mergeData(data, sensitiveData));
        },
        info: (message: string, data?: LogData, sensitiveData?: LogData) => {
            apifyLogger.info(message, mergeData(data, sensitiveData));
        },
        warning: (message: string, data?: LogData, sensitiveData?: LogData) => {
            apifyLogger.warning(message, mergeData(data, sensitiveData));
        },
        error: (message: string, data?: LogData, sensitiveData?: LogData) => {
            apifyLogger.error(message, mergeData(data, sensitiveData));
        },
    };
}

function noOp() {
    /* no-op */
}

function mergeData(data?: LogData, sensitiveData?: LogData): LogData | undefined {
    if (!data && !sensitiveData) return undefined;
    return { ...data, ...sensitiveData };
}
