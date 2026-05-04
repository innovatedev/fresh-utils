/**
 * @module
 *
 * This module provides an in-memory implementation of the `SessionStorage` interface.
 *
 * It defaults to using a `Map` to store session data. This is useful for local development
 * or testing where persistence is not required.
 *
 * @example
 * ```ts
 * import { MemorySessionStorage } from "@innovatedev/fresh-session/memory-store";
 * const store = new MemorySessionStorage();
 * ```
 */
import type { SessionData, SessionStorage, StoredSession } from "../session.ts";
import { SessionConflictError } from "../errors.ts";

/**
 * In-memory session storage.
 *
 * **Warning**: This storage is ephemeral and will be cleared when the server restarts.
 * It is primarily intended for development and testing purposes.
 */
export class MemorySessionStorage implements SessionStorage {
  #store = new Map<string, { data: unknown; version: number }>();

  /**
   * Retrieves session data from memory.
   */
  get(
    sessionId: string,
  ): (StoredSession<SessionData> & { version: string }) | undefined {
    const entry = this.#store.get(sessionId);
    if (!entry) return undefined;

    // We clone the data to avoid reference leakage between concurrent requests.
    // This simulates the behavior of serialized storage backends (KV, Redis, etc.)
    return {
      ...(structuredClone(entry.data) as StoredSession<SessionData>),
      version: entry.version.toString(),
    };
  }

  /**
   * Stores session data in memory with optimistic locking.
   */
  set(
    sessionId: string,
    data: unknown,
    version?: string,
  ): void {
    const existing = this.#store.get(sessionId);

    if (existing && version !== undefined) {
      if (existing.version.toString() !== version) {
        throw new SessionConflictError();
      }
    }

    const nextVersion = existing ? existing.version + 1 : 1;
    // Clone on write too to be safe
    this.#store.set(sessionId, {
      data: structuredClone(data),
      version: nextVersion,
    });
  }

  /**
   * Deletes session data from memory.
   */
  delete(sessionId: string): void {
    this.#store.delete(sessionId);
  }
}
