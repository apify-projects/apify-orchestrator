import { Queue } from 'src/utils/queue.js';

describe('queue utils', () => {
    describe('Queue', () => {
        const item1 = 'test-value-1';
        const item2 = 'test-value-2';

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
        });
    });
});
