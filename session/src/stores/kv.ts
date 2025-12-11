/**
 * @module
 *
 * This module provides a persistent implementation of the `SessionStorage` interface using Deno KV.
 *
 * It allows your sessions to persist across server restarts and is suitable for production
 * environments like Deno Deploy.
 *
 * @example
 * ```ts
 * import { DenoKvSessionStorage } from "@innovatedev-fresh/session/kv-store";
 *
 * const kv = await Deno.openKv();
 * const store = new DenoKvSessionStorage(kv);
 * ```
 */
import type { SessionData, SessionStorage } from "../session.ts";

/**
 * Persistent session storage using Deno KV.
 *
 * This storage uses Deno's built-in Key-Value store to persist sessions.
 * It is suitable for production use in Deno Deploy or any Deno environment.
 */
export class DenoKvSessionStorage implements SessionStorage {
  private kv: Promise<Deno.Kv>;
  private prefix: Deno.KvKey;
  private expireAfter?: number;
  private userKeyPrefix: Deno.KvKey;

  /**
   * @param options Configuration options.
   */
  constructor(
    options: {
      /** Key prefix for session data (default: ["session"]) */
      prefix?: Deno.KvKey;
      /** Expiration time in seconds for session records */
      expireAfter?: number;
      /** Key prefix for user data (default: ["users"]) */
      userKeyPrefix?: Deno.KvKey;
    },
  );
  /**
   * @param kv Optional Deno KV instance or promise. If not provided, `Deno.openKv()` is used.
   * @param options Configuration options.
   */
  constructor(
    kv?: Deno.Kv | Promise<Deno.Kv>,
    options?: {
      /** Key prefix for session data (default: ["session"]) */
      prefix?: Deno.KvKey;
      /** Expiration time in seconds for session records */
      expireAfter?: number;
      /** Key prefix for user data (default: ["users"]) */
      userKeyPrefix?: Deno.KvKey;
    },
  );
  /**
   * @deprecated Use the options object signature instead.
   */
  constructor(
    kv: Deno.Kv,
    prefix?: Deno.KvKey,
    expireAfter?: number,
  );
  constructor(
    kvOrPromiseOrOptions?:
      | Deno.Kv
      | Promise<Deno.Kv>
      | {
        prefix?: Deno.KvKey;
        expireAfter?: number;
        userKeyPrefix?: Deno.KvKey;
      },
    optionsOrPrefix?:
      | {
        prefix?: Deno.KvKey;
        expireAfter?: number;
        userKeyPrefix?: Deno.KvKey;
      }
      | Deno.KvKey,
    expireAfterArg?: number,
  ) {
    let kv: Deno.Kv | Promise<Deno.Kv> | undefined;
    let options: {
      prefix?: Deno.KvKey;
      expireAfter?: number;
      userKeyPrefix?: Deno.KvKey;
    } = {};

    // Analyze first argument
    if (
      kvOrPromiseOrOptions instanceof Promise ||
      (kvOrPromiseOrOptions && "atomic" in kvOrPromiseOrOptions)
    ) {
      // It's a KV or Promise<KV>
      kv = kvOrPromiseOrOptions as Deno.Kv | Promise<Deno.Kv>;

      // Second argument should be options or prefix (legacy)
      if (Array.isArray(optionsOrPrefix)) {
        options.prefix = optionsOrPrefix;
        options.expireAfter = expireAfterArg;
        options.userKeyPrefix = ["users"];
      } else {
        options = (optionsOrPrefix as typeof options) || {};
      }
    } else if (kvOrPromiseOrOptions && !Array.isArray(kvOrPromiseOrOptions)) {
      // It's likely the options object (and no KV was passed)
      // Implicit KV open
      kv = Deno.openKv();
      options = kvOrPromiseOrOptions as typeof options;
    } else {
      // No arguments or undefined first arg
      kv = Deno.openKv();
      options = (optionsOrPrefix as typeof options) || {};
    }

    if (kv instanceof Promise) {
      this.kv = kv;
    } else {
      this.kv = Promise.resolve(kv!);
    }

    this.prefix = options.prefix || ["session"];
    this.expireAfter = options.expireAfter;
    this.userKeyPrefix = options.userKeyPrefix || ["users"];
  }

  /**
   * Retrieves session data from Deno KV.
   */
  async get(sessionId: string): Promise<SessionData | undefined> {
    const kv = await this.kv;
    const res = await kv.get<SessionData>([...this.prefix, sessionId]);
    return res.value || undefined;
  }

  /**
   * Stores session data in Deno KV.
   */
  async set(sessionId: string, data: SessionData): Promise<void> {
    const kv = await this.kv;
    await kv.set([...this.prefix, sessionId], data, {
      expireIn: this.expireAfter ? this.expireAfter * 1000 : undefined,
    });
  }

  /**
   * Deletes session data from Deno KV.
   */
  async delete(sessionId: string): Promise<void> {
    const kv = await this.kv;
    await kv.delete([...this.prefix, sessionId]);
  }

  /**
   * Resolves a user from Deno KV using the configured user key prefix.
   */
  async resolveUser(userId: string): Promise<unknown | undefined> {
    const kv = await this.kv;
    const res = await kv.get([...this.userKeyPrefix, userId]);
    return res.value || undefined;
  }
}
