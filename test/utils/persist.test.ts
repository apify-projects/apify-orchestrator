import { Actor } from 'apify';
import { State } from 'src/utils/persist.js';

describe('persist', () => {
    describe('State', () => {
        const key = 'test-key';
        const initValue = 'test-init-value';
        const defaultValue = 'test-default-value';

        afterEach(async () => {
            await Actor.setValue(key, null);
        });

        it('syncs its state with the Key Value Store when calling sync', async () => {
            await Actor.setValue(key, initValue);
            const state = new State(defaultValue);
            expect(state.value).toBe(defaultValue);
            await state.sync(key, 'kvs');
            expect(state.value).toBe(initValue);
        });

        it('updates its value correctly when not synced', async () => {
            const state = new State(defaultValue);
            expect(state.value).toBe(defaultValue);
            const newValue = 'test-new-value';
            await state.update(newValue);
            expect(state.value).toBe(newValue);
        });

        it('updates its value correctly after sync', async () => {
            const state = new State(defaultValue);
            expect(state.value).toBe(defaultValue);
            await state.sync(key, 'kvs');
            expect(state.value).toBe(defaultValue);
            const newValue = 'test-new-value';
            await state.update(newValue);
            expect(state.value).toBe(newValue);
            expect(await Actor.getValue(key)).toBe(newValue);
        });

        it('updates correctly with a callback as updater', async () => {
            const state = new State(defaultValue);
            expect(state.value).toBe(defaultValue);
            await state.update((prev) => `${prev}-updated`);
            expect(state.value).toBe(`${defaultValue}-updated`);
        });
    });
});
