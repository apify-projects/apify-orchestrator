import { Actor } from 'apify';

export type PersistSupport = 'kvs' | 'none'

type Updater<T> = T | ((prev: T) => T)

function isCallback<T>(maybeFunction: Updater<T>): maybeFunction is ((prev: T) => T) {
    return typeof maybeFunction === 'function';
}

export class State<T> {
    protected key: string | undefined;
    protected persistSupport: PersistSupport = 'none';

    protected memoryValue: T;

    constructor(defaultValue: T) {
        this.memoryValue = defaultValue;
    }

    async sync(key: string, persistSupport: PersistSupport = 'none') {
        this.key = key;
        this.persistSupport = persistSupport;
        const storedValue = await Actor.getValue<T>(this.key);
        if (storedValue) this.memoryValue = storedValue;
        else {
            await Actor.setValue(this.key, this.memoryValue);
        }
    }

    get value() { return this.memoryValue; }

    async update(upd: Updater<T>) {
        if (isCallback(upd)) this.memoryValue = upd(this.memoryValue);
        else this.memoryValue = upd;
        if (this.key && this.persistSupport === 'kvs') {
            await Actor.setValue(this.key, this.memoryValue);
        }
    }
}
