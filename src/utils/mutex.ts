type WakeFn = () => void

export class Mutex<T> {
    protected obj: T;

    constructor(obj: T) {
        this.obj = obj;
    }

    protected lockFlag = false;
    protected nextQueue: WakeFn[] = [];

    protected async acquireLock() {
        return new Promise<void>((resolve) => {
            if (!this.lockFlag) {
                this.lockFlag = true;
                resolve();
            } else {
                this.nextQueue.push(resolve);
            }
        });
    }

    protected releaseLock() {
        const next = this.nextQueue.shift();
        if (next) {
            next();
        } else {
            this.lockFlag = false;
        }
    }

    get isLocked() {
        return this.lockFlag;
    }

    async lock(op: (obj: T) => Promise<void> | void) {
        await this.acquireLock();
        await op(this.obj);
        this.releaseLock();
    }
}
