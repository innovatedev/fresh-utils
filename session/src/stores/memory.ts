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
    return {
      ...(entry.data as unknown as StoredSession<SessionData>),
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
  ): { ok: boolean } {
    const existing = this.#store.get(sessionId);

    if (existing && version !== undefined) {
      if (existing.version.toString() !== version) {
        return { ok: false };
      }
    }

    const nextVersion = existing ? existing.version + 1 : 1;
    this.#store.set(sessionId, { data, version: nextVersion });
    return { ok: true };
  }

  /**
   * Deletes session data from memory.
   */
  delete(sessionId: string): void {
    this.#store.delete(sessionId);
  }
}
