import { log } from 'apify';

// FIXME: type copied from SDK
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AdditionalData = Record<string, any> | null

const prefixMessage = (prefix: string, msg: string) => `[${prefix}] ${msg}`;

export class CustomLogger {
    readonly isEnabled: boolean;
    readonly hideSensibleInformation: boolean;

    constructor(isEnabled: boolean, hideSensibleInformation: boolean) {
        this.isEnabled = isEnabled;
        this.hideSensibleInformation = hideSensibleInformation;
    }

    protected generateLogData(data?: AdditionalData, sensibleData?: AdditionalData) {
        if (this.hideSensibleInformation) { return data; }
        if (!data && !sensibleData) { return undefined; }
        return { ...(data ?? {}), ...(sensibleData ?? {}) };
    }

    debug(msg: string, data?: AdditionalData, sensibleData?: AdditionalData) {
        if (this.isEnabled) { log.debug(msg, this.generateLogData(data, sensibleData)); }
    }

    info(msg: string, data?: AdditionalData, sensibleData?: AdditionalData) {
        if (this.isEnabled) { log.info(msg, this.generateLogData(data, sensibleData)); }
    }

    warning(msg: string, data?: AdditionalData, sensibleData?: AdditionalData) {
        if (this.isEnabled) { log.warning(msg, this.generateLogData(data, sensibleData)); }
    }

    error(msg: string, data?: AdditionalData, sensibleData?: AdditionalData) {
        if (this.isEnabled) { log.error(msg, this.generateLogData(data, sensibleData)); }
    }

    prfxDebug(prfx: string, msg: string, data?: AdditionalData, sensibleData?: AdditionalData) {
        if (this.isEnabled) { log.debug(prefixMessage(prfx, msg), this.generateLogData(data, sensibleData)); }
    }

    prfxInfo(prfx: string, msg: string, data?: AdditionalData, sensibleData?: AdditionalData) {
        if (this.isEnabled) { log.info(prefixMessage(prfx, msg), this.generateLogData(data, sensibleData)); }
    }

    prfxWarn(prfx: string, msg: string, data?: AdditionalData, sensibleData?: AdditionalData) {
        if (this.isEnabled) { log.warning(prefixMessage(prfx, msg), this.generateLogData(data, sensibleData)); }
    }

    prfxError(prfx: string, msg: string, data?: AdditionalData, sensibleData?: AdditionalData) {
        if (this.isEnabled) { log.error(prefixMessage(prfx, msg), this.generateLogData(data, sensibleData)); }
    }
}
