/**
 * A map of outcome variant tags to their associated value types.
 * @example
 * ```ts
 * type MyVariants = {
 *     success: number;
 *     failure: Error;
 * };
 * ```
 */
export type OutcomeVariants = Record<string, unknown>;

/**
 * A generic outcome class that can represent different variants (e.g., success/failure, or success/failure/retry).
 * This provides a type-safe way to handle different outcomes with exhaustive pattern matching.
 *
 * @example
 * ```ts
 * class BasicResult extends Outcome<{ success: number; failure: Error }> {}
 *
 * const result = new BasicResult('success', 42);
 * const text = result.match({
 *     success: (value) => `Got: ${value}`,
 *     failure: (error) => `Error: ${error.message}`,
 * });
 * ```
 */
export abstract class Outcome<M extends OutcomeVariants> {
    constructor(
        private readonly tag: keyof M,
        private readonly value: M[keyof M],
    ) {}

    /**
     * Match on the outcome and handle each variant.
     * All variants must be handled for type safety.
     */
    match<U>(handlers: { [K in keyof M]: (value: M[K]) => U }): U {
        return handlers[this.tag](this.value as M[keyof M & string]);
    }
}
