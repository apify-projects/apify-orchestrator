import { log } from 'apify';

// FIXME: type copied from SDK
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AdditionalData = Record<string, any> | null;

const prefixMessage = (prefix: string, msg: string) => `[${prefix}] ${msg}`;

export class CustomLogger {
    readonly isEnabled: boolean;
    readonly hideSensitiveInformation: boolean;

    constructor(isEnabled: boolean, hideSensitiveInformation: boolean) {
        this.isEnabled = isEnabled;
        this.hideSensitiveInformation = hideSensitiveInformation;
    }

    protected generateLogData(data?: AdditionalData, sensitiveData?: AdditionalData) {
        if (this.hideSensitiveInformation) {
            return data;
        }
        if (!data && !sensitiveData) {
            return undefined;
        }
        return { ...(data ?? {}), ...(sensitiveData ?? {}) };
    }

    debug(msg: string, data?: AdditionalData, sensitiveData?: AdditionalData) {
        if (this.isEnabled) {
            log.debug(msg, this.generateLogData(data, sensitiveData));
        }
    }

    info(msg: string, data?: AdditionalData, sensitiveData?: AdditionalData) {
        if (this.isEnabled) {
            log.info(msg, this.generateLogData(data, sensitiveData));
        }
    }

    warning(msg: string, data?: AdditionalData, sensitiveData?: AdditionalData) {
        if (this.isEnabled) {
            log.warning(msg, this.generateLogData(data, sensitiveData));
        }
    }

    error(msg: string, data?: AdditionalData, sensitiveData?: AdditionalData) {
        if (this.isEnabled) {
            log.error(msg, this.generateLogData(data, sensitiveData));
        }
    }

    prfxDebug(prfx: string, msg: string, data?: AdditionalData, sensitiveData?: AdditionalData) {
        if (this.isEnabled) {
            log.debug(prefixMessage(prfx, msg), this.generateLogData(data, sensitiveData));
        }
    }

    prfxInfo(prfx: string, msg: string, data?: AdditionalData, sensitiveData?: AdditionalData) {
        if (this.isEnabled) {
            log.info(prefixMessage(prfx, msg), this.generateLogData(data, sensitiveData));
        }
    }

    prfxWarn(prfx: string, msg: string, data?: AdditionalData, sensitiveData?: AdditionalData) {
        if (this.isEnabled) {
            log.warning(prefixMessage(prfx, msg), this.generateLogData(data, sensitiveData));
        }
    }

    prfxError(prfx: string, msg: string, data?: AdditionalData, sensitiveData?: AdditionalData) {
        if (this.isEnabled) {
            log.error(prefixMessage(prfx, msg), this.generateLogData(data, sensitiveData));
        }
    }
}
