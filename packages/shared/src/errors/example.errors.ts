/**
 * Example module error codes — demonstrates that the per-module namespacing
 * pattern extends beyond `common`. Real modules (auth, billing, ...) follow
 * this same shape: a `MODULE_ERROR_CODES` const array + a derived union type.
 */
export const EXAMPLE_ERROR_CODES = ['example/NOT_FOUND', 'example/ALREADY_EXISTS'] as const;

export type ExampleErrorCode = (typeof EXAMPLE_ERROR_CODES)[number];
