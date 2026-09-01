// DISPOSABLE LINT FIXTURE (TASK-009 / SPEC-005).
// The public entry point of _fixture-b. Re-exports the internal value so
// consumers go through this file instead of reaching into ./internal/x.
export { internalValue } from "./internal/x";
