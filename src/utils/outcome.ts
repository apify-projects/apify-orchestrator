/**
 * A map of outcome variant tags to their associated value types.
 *
 * @example
 * ```ts
 * type MyVariants = {
 *     success: number;
 *     failure: string;
 * };
 * ```
 */
export type ResultVariants = Record<string, unknown>;

/**
 * A union type representing the possible outcomes based on the provided variants.
 * Each variant is represented as an object with a single key-value pair.
 *
 * @example
 * ```ts
 * type MyResult = Result<{ success: number; failure: string }>;
 *
 * const successResult: MyResult = { success: 42 };
 * const failureResult: MyResult = { failure: 'Something went wrong' };
 *
 * // Invalid results (will cause a TypeScript error)
 * const tooManyResults: MyResult = { success: 42, failure: 'Error' };
 * const wrongTypeResult: MyResult = { success: 'Not a number' };
 * const unknownVariant: MyResult = { unknown: true };
 * const emptyResult: MyResult = {};
 * ```
 */
export type Result<Variants extends ResultVariants> = {
    // Let's take as an example Variants = { a: number; b: string }.
    [Key in keyof Variants]: {
        // let's consider Key = 'a'
        [SelectedKey in Key]: Variants[Key]; // this results in { a: number }
    } & {
        [SelectedKey in Exclude<keyof Variants, Key>]?: never; // this results in { b?: never }
    }; // so overall we get { a: { a: number; b?: never }, b: { a?: never; b: string } }
}[keyof Variants]; // finally, we extract the union { a: number; b?: never } | { a?: never; b: string }

/**
 * A generic outcome class that can represent different variants (e.g., success/failure, or success/failure/retry).
 * This provides a type-safe way to handle different outcomes with exhaustive pattern matching.
 *
 * You should pass a `Result` object as the constructor argument.
 *
 * The class is abstract to encourage the creation of specific outcome classes with their own variants.
 *
 * @example
 * ```ts
 * class BasicOutcome extends Outcome<{ success: number; failure: string }> {}
 *
 * const outcome = new BasicOutcome({ success: 42 });
 *
 * const text = outcome.match({
 *     success: (value) => `Got: ${value}`,
 *     failure: (error) => `Error: ${error}`,
 * }); // "Got: 42"
 * ```
 */
export abstract class Outcome<Variants extends ResultVariants> {
    private readonly result: Result<Variants>;

    constructor(result: Result<Variants>) {
        this.result = result;
    }

    get variant(): keyof Variants {
        return Object.keys(this.result)[0];
    }

    get value(): Variants[keyof Variants] {
        return Object.values(this.result)[0];
    }

    /**
     * Match on the outcome and handle each variant.
     * All variants must be handled for type safety.
     */
    match<T>(handlers: { [Key in keyof Variants]: (value: Variants[Key]) => T }): T {
        const key = Object.keys(this.result)[0] as keyof Variants;
        const value = this.result[key] as Variants[typeof key];
        return handlers[key](value);
    }
}
