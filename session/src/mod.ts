/**
 * @module
 *
 * Essential session middleware for Fresh applications.
 *
 * This module provides the `createSessionMiddleware` factory and associated types
 * for handling server-side sessions in Fresh.
 *
 * @example
 * ```ts
 * import { createSessionMiddleware } from "@innovatedev/fresh-session";
 * import { MemorySessionStorage } from "@innovatedev/fresh-session/memory-store";
 *
 * const session = createSessionMiddleware({
 *   store: new MemorySessionStorage(),
 * });
 * ```
 */
export * from "./session.ts";
export { DenoKvSessionStorage } from "./stores/kv.ts";
export { MemorySessionStorage } from "./stores/memory.ts";
export {
  KvDexSessionStorage,
  type KvDexSessionStorageOptions,
} from "./stores/kvdex.ts";
