// DISPOSABLE LINT FIXTURE (TASK-009 / SPEC-005).
// An "internal" file of _fixture-b that must NOT be importable from outside
// this module -- only via _fixture-b/index.ts. Used as the negative control
// for the oxlint boundaries/dependencies rule.
export const internalValue = "fixture-b-internal";
