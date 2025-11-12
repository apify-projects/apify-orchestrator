export class Queue<T> {
    protected data: T[] = [];

    enqueue(...items: T[]) {
        this.data.push(...items);
    }

    prepend(...items: T[]) {
        this.data.unshift(...items);
    }

    get length() {
        return this.data.length;
    }

    find(predicate: (d: T) => boolean): T | undefined {
        return this.data.find(predicate);
    }

    peek(): T | undefined {
        return this.data[0];
    }

    dequeue(): T | undefined {
        // Array.shift is inefficient with very large arrays: it shouldn't be a problem here.
        return this.data.shift();
    }
}
