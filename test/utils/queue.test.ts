import { Queue } from 'src/utils/queue.js';

describe('queue utils', () => {
    describe('Queue', () => {
        const item1 = 'test-value-1';
        const item2 = 'test-value-2';
        const item3 = 'test-value-3';

        it('works as expected', () => {
            const queue = new Queue<string>();

            expect(queue.length).toBe(0);
            expect(queue.peek()).toBe(undefined);
            expect(queue.dequeue()).toBe(undefined);

            queue.enqueue(item1);

            expect(queue.length).toBe(1);
            expect(queue.peek()).toBe(item1);
            expect(queue.find((el) => el === item1)).toBe(item1);
            expect(queue.find((el) => el !== item1)).toBe(undefined);

            const dequeuedItem = queue.dequeue();

            expect(dequeuedItem).toBe(item1);
            expect(queue.length).toBe(0);
            expect(queue.peek()).toBe(undefined);

            queue.enqueue(item1);
            queue.enqueue(item2);

            expect(queue.length).toBe(2);
            expect(queue.peek()).toBe(item1);
            expect(queue.find((el) => el === item1)).toBe(item1);
            expect(queue.find((el) => el !== item1)).toBe(item2);

            queue.prepend(item3);
            expect(queue.length).toBe(3);
            expect(queue.peek()).toBe(item3);

            expect(queue.dequeue()).toBe(item3);
            expect(queue.dequeue()).toBe(item1);
            expect(queue.dequeue()).toBe(item2);
            expect(queue.length).toBe(0);
        });
    });
});
