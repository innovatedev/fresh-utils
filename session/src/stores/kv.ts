import type { SessionData, SessionStorage } from "../session.ts";

/**
 * @module
 *
 * Persistent session storage using Deno KV.
 *
 * This storage uses Deno's built-in Key-Value store to persist sessions.
 * It is suitable for production use in Deno Deploy or any Deno environment.
 */
export class DenoKvSessionStorage implements SessionStorage {
  /**
   * @param kv The Deno KV instance.
   * @param prefix The key prefix for session data (default: ["session"]).
   */
  constructor(private kv: Deno.Kv, private prefix: Deno.KvKey = ["session"]) {}

  /**
   * Retrieves session data from Deno KV.
   */
  async get(sessionId: string): Promise<SessionData | undefined> {
    const res = await this.kv.get<SessionData>([...this.prefix, sessionId]);
    return res.value || undefined;
  }

  /**
   * Stores session data in Deno KV.
   */
  async set(sessionId: string, data: SessionData): Promise<void> {
    await this.kv.set([...this.prefix, sessionId], data);
  }

  /**
   * Deletes session data from Deno KV.
   */
  async delete(sessionId: string): Promise<void> {
    await this.kv.delete([...this.prefix, sessionId]);
  }
}
