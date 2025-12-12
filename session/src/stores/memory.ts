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
import type { SessionData, SessionStorage } from "../session.ts";

/**
 * In-memory session storage.
 *
 * **Warning**: This storage is ephemeral and will be cleared when the server restarts.
 * It is primarily intended for development and testing purposes.
 */
export class MemorySessionStorage implements SessionStorage {
  #store = new Map<string, SessionData>();

  /**
   * Retrieves session data from memory.
   */
  get(sessionId: string): SessionData | undefined {
    return this.#store.get(sessionId);
  }

  /**
   * Stores session data in memory.
   */
  set(sessionId: string, data: SessionData): void {
    this.#store.set(sessionId, data);
  }

  /**
   * Deletes session data from memory.
   */
  delete(sessionId: string): void {
    this.#store.delete(sessionId);
  }
}
