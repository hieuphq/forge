/**
 * Re-export of `packages/shared`'s `AppError` (and friends) so callers
 * within `apps/api` can `import { AppError } from "./error/app-error"`
 * without reaching into `@yourorg/shared` directly everywhere. The class
 * itself is NOT duplicated — this is a thin pass-through.
 */
export { AppError } from "@yourorg/shared";
export type { AppErrorDetails, ErrorCode, Locale } from "@yourorg/shared";
export { getUserMessage } from "@yourorg/shared";
