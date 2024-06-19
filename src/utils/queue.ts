export class Queue<T> {
    protected data: T[] = [];

    enqueue(...items: T[]) {
        this.data.push(...items);
    }

    get length() {
        return this.data.length;
    }

    find(predicate: (d: T) => boolean) {
        return this.data.find(predicate);
    }

    peek() {
        return this.data.at(0);
    }

    dequeue() {
        // Array.shift is inefficient with very large arrays: it shouldn't be a problem here.
        return this.data.shift();
    }
}
