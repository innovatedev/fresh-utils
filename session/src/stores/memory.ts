import type { SessionData, SessionStorage } from "../session.ts";

export class MemorySessionStorage implements SessionStorage {
  #store = new Map<string, SessionData>();

  get(sessionId: string): SessionData | undefined {
    return this.#store.get(sessionId);
  }

  set(sessionId: string, data: SessionData): void {
    this.#store.set(sessionId, data);
  }

  delete(sessionId: string): void {
    this.#store.delete(sessionId);
  }
}
