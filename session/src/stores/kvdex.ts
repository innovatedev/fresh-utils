/**
 * @module
 *
 * This module provides a Persistent Session Storage using `kvdex`.
 *
 * `kvdex` allows for strongly typed schemas and secondary indexing, which this
 * storage implementation leverages for structured data and efficient user lookups.
 *
 * @example
 * ```ts
 * import { KvDexSessionStorage } from "@innovatedev/fresh-session/kvdex-store";
 * // ... setup ...
 * ```
 */
import type { SessionStorage, StoredSession } from "../session.ts";
import {
  type Collection,
  type KvValue,
  model,
  type ParseId,
} from "@olli/kvdex";

// Re-export types that are part of the public API surface
export type { Collection, KvValue };
export type { SessionStorage } from "../session.ts";

/**
 * Factory for creating the base Zod schema for a stored session document in kvdex.
 *
 * Use this to extend your session models to ensure they include all
 * internal fields required by `fresh-session`.
 *
 * @param z The Zod instance to use (usually imported from kvdex).
 * @returns A Zod schema object.
 *
 * @example
 * ```ts
 * import { z } from "@olli/kvdex";
 * import { sessionSchemaFactory } from "@innovatedev/fresh-session/kvdex-store";
 *
 * export const MySessionSchema = sessionSchemaFactory(z).extend({
 *   theme: z.enum(["light", "dark"]).default("light"),
 * });
 * ```
 *
 * @deprecated Use {@link sessionModel} instead for a library-agnostic approach.
 */
// deno-lint-ignore no-explicit-any
export function sessionSchemaFactory(z: any): any {
  return z
    .object({
      /** Timestamp of creation. */
      createdAt: z.date(),
      /** Timestamp of last update. */
      updatedAt: z.date(),
      /** Timestamp of the last user interaction. */
      lastSeenAt: z.date(),
      /** Timestamp of expiration. */
      expiresAt: z.date(),
      /** User-defined session data. */
      data: z.any(),
      /** The unique user identifier (if logged in). */
      userId: z.string().optional(),
      /** Internal flash message storage. */
      flash: z.record(z.any()).default({}),
      /** Captured User-Agent string for validation. */
      ua: z.string().optional(),
      /** Captured Client IP address for validation. */
      ip: z.string().optional(),
    }).passthrough();
}

/**
 * Minimal Standard Schema V1 interface for type inference.
 * @see https://jsr.io/@standard-schema/spec
 */
export interface StandardSchemaV1<I = unknown, O = I> {
  /** The standard schema metadata. */
  readonly "~standard": {
    /** The version of the standard schema. */
    readonly version: 1;
    /** The vendor name of the schema library. */
    readonly vendor: string;
    /** Validates the input value. */
    readonly validate: (
      value: unknown,
    ) => StandardSchemaV1.Result<O> | Promise<StandardSchemaV1.Result<O>>;
    /** Optional types for inference. */
    readonly types?: {
      /** The input type. */
      readonly input?: I;
      /** The output type. */
      readonly output?: O;
    };
  };
}

/**
 * Standard Schema V1 namespace for result types.
 */
// deno-lint-ignore no-namespace
export namespace StandardSchemaV1 {
  /** The result of a validation. */
  export type Result<O> = SuccessResult<O> | FailureResult;
  /** Success result containing the validated value. */
  export interface SuccessResult<O> {
    /** The validated value. */
    readonly value: O;
    /** No issues. */
    readonly issues?: undefined;
  }
  /** Failure result containing validation issues. */
  export interface FailureResult {
    /** No value. */
    readonly value?: undefined;
    /** The list of validation issues. */
    readonly issues: ReadonlyArray<Issue>;
  }
  /** A single validation issue. */
  export interface Issue {
    /** The error message. */
    readonly message: string;
    /** The path to the failing property. */
    readonly path?: ReadonlyArray<PropertyKey | { key: PropertyKey }>;
  }
}

/**
 * Creates a library-agnostic kvdex model for sessions.
 *
 * If no validator is provided, this returns a model with no runtime validation (only types).
 * If a Standard Schema compliant validator (Arktype, Zod, Valibot, etc.) is provided,
 * it will be used for type inference.
 *
 * @template TData The type of the user-defined session data.
 * @param dataValidator Optional Standard Schema compliant validator for the session data.
 * @returns A kvdex model.
 */
export function sessionModel<TData extends KvValue>(
  // deno-lint-ignore no-explicit-any
  _dataValidator?: StandardSchemaV1<any, TData> | any,
  // deno-lint-ignore no-explicit-any
): any {
  // We return a raw model for the SessionDoc structure.
  // This is the most stable and library-agnostic approach.
  // deno-lint-ignore no-explicit-any
  return model<SessionDoc<TData>>() as any;
}

/**
 * Legacy alias for sessionSchemaFactory.
 *
 * @deprecated Will be removed in v1.0.0. Use {@link sessionSchemaFactory} instead.
 */
// deno-lint-ignore no-explicit-any
export const createBaseSessionSchema: (z: any) => any = sessionSchemaFactory;

/**
 * Minimal shape required for the session document stored in kvdex.
 *
 * Your kvdex schema for the session collection MUST generally conform to this shape,
 * though you can extend `data` with your specific `SessionData` type.
 */
export type SessionDoc<TData extends KvValue> = {
  createdAt: Date;
  updatedAt: Date;
  lastSeenAt: Date;
  expiresAt: Date;
  data: TData;
  userId?: string;
  flash: Record<string, KvValue>;
  ua?: string;
  ip?: string;
};

/**
 * Configuration options for the `KvDexSessionStorage`.
 */
export interface KvDexSessionStorageOptions<
  TSessionData extends KvValue,
  TUser extends KvValue,
> {
  /** The kvdex collection for sessions. */
  // deno-lint-ignore no-explicit-any
  collection: Collection<any, any, any>;

  /** The kvdex collection for users. Optional. */
  // deno-lint-ignore no-explicit-any
  userCollection?: Collection<any, any, any>;
  /**
   * Session expiration in seconds.
   */
  expireAfter?: number;
  /**
   * Optional secondary index name to use for user resolution.
   * If provided, `resolveUser` will search using this index instead of the primary key.
   */
  userIndex?: string;
  /**
   * Optional Standard Schema compliant validator for the session data.
   */
  // deno-lint-ignore no-explicit-any
  dataValidator?: StandardSchemaV1<any, TSessionData> | any;
}

/**
 * Session storage implementation backed by `kvdex` (Deno KV with typed Collections).
 *
 * This storage uses `kvdex` Collections to persist session data, providing
 * type safety and secondary index capabilities for user resolution.
 *
 * @example
 * ```ts
 * import { kvdex, collection, model } from "@olli/kvdex";
 * import { KvDexSessionStorage } from "@innovatedev/fresh-session/kvdex-store";
 *
 * const kv = await Deno.openKv();
 * const db = kvdex({
 *   kv,
 *   schema: {
 *     sessions: collection(model<any>()),
 *     users: collection(model<any>()),
 *   },
 * });
 *
 * const store = new KvDexSessionStorage({
 *   collection: db.sessions,
 *   userCollection: db.users,
 * });
 * ```
 */
export class KvDexSessionStorage<
  const TSessionData extends KvValue,
  const TUser extends KvValue,
> implements SessionStorage {
  // deno-lint-ignore no-explicit-any
  #collection: Collection<any, any, any>;
  // deno-lint-ignore no-explicit-any
  #userCollection?: Collection<any, any, any>;
  #expireAfter?: number;
  #userIndex?: string;
  // deno-lint-ignore no-explicit-any
  #dataValidator?: StandardSchemaV1<any, TSessionData>;

  /**
   * Create a new Kvdex session storage instance.
   *
   * @param options Configuration for the storage, including kvdex collections.
   */
  constructor(
    options: KvDexSessionStorageOptions<TSessionData, TUser>,
  ) {
    this.#collection = options.collection;
    this.#userCollection = options.userCollection;
    this.#expireAfter = options.expireAfter;
    this.#userIndex = options.userIndex;
    this.#dataValidator = options.dataValidator;
  }

  /**
   * Retrieves session data from the kvdex collection.
   */
  async get(
    sessionId: string,
  ): Promise<StoredSession<TSessionData> | undefined> {
    // We cast sessionId to ParseId because SessionStorage enforces string IDs
    const doc = await this.#collection.find(
      // deno-lint-ignore no-explicit-any
      sessionId as unknown as ParseId<any>,
    );

    if (!doc) return undefined;

    const val = doc.value as SessionDoc<TSessionData>;

    // Reconstruct StoredSession format for the middleware
    // We add guard rails here to prevent crashing on corrupted data
    const stored: StoredSession<TSessionData> = {
      data: val.data,
      flash: (val.flash || {}) as Record<string, unknown>,
      userId: val.userId,
      lastSeenAt: val.lastSeenAt instanceof Date
        ? val.lastSeenAt.getTime()
        : (typeof val.lastSeenAt === "number" ? val.lastSeenAt : Date.now()),
      ua: val.ua,
      ip: val.ip,
    };

    // Runtime validation if a validator is provided
    if (this.#dataValidator) {
      try {
        const result = this.#dataValidator["~standard"].validate(stored.data);
        if (result instanceof Promise) {
          const resolved = await result;
          if (resolved.issues) return undefined; // Invalid data, treat as no session
          stored.data = resolved.value;
        } else if (result.issues) {
          return undefined; // Invalid data
        } else {
          stored.data = result.value;
        }
      } catch (err) {
        // If the validator itself throws, we treat the session as invalid
        // to prevent a total application crash. We only log the error if
        // we are NOT in a test environment to keep test results clean.
        // deno-lint-ignore no-explicit-any
        if (!(globalThis as any).Deno?.test) {
          console.error("Session validator exploded:", err);
        }
        return undefined;
      }
    }

    return stored;
  }

  /**
   * Stores session data in the kvdex collection.
   *
   * @param sessionId The unique session identifier.
   * @param payload The wrapped session payload from the middleware.
   */
  async set(
    sessionId: string,
    payload: StoredSession<TSessionData>,
  ): Promise<void> {
    // Check if session exists to preserve createdAt and manage indices
    const existing = await this.#collection.find(
      // deno-lint-ignore no-explicit-any
      sessionId as unknown as ParseId<any>,
    );

    const now = new Date();
    // Safe access because we know the shape somewhat, but runtime check remains useful
    const existingVal = existing?.value as
      | Partial<SessionDoc<TSessionData>>
      | undefined;

    const createdAt = existingVal?.createdAt ?? now;
    const expiresAt = this.#expireAfter
      ? new Date(now.getTime() + this.#expireAfter * 1000)
      : new Date(now.getTime() + 1000 * 60 * 60 * 24 * 365); // Default to 1 year if not set

    // Extract fields from StoredSession payload (which middleware passes as payload)
    // deno-lint-ignore no-explicit-any
    const p = payload as any;

    // Runtime validation before set
    if (this.#dataValidator) {
      const result = this.#dataValidator["~standard"].validate(p.data);
      if (result instanceof Promise) {
        const resolved = await result;
        if (resolved.issues) {
          throw new Error(
            `Session data validation failed: ${
              resolved.issues.map((i) => i.message).join(", ")
            }`,
          );
        }
      } else if (result.issues) {
        throw new Error(
          `Session data validation failed: ${
            result.issues.map((i) => i.message).join(", ")
          }`,
        );
      }
    }

    // Construct the full document matching SessionDoc structure
    const doc: SessionDoc<TSessionData> = {
      createdAt,
      updatedAt: now,
      expiresAt,
      data: p.data,
      flash: p.flash ?? {},
      userId: p.userId,
      lastSeenAt: p.lastSeenAt ? new Date(p.lastSeenAt) : now,
      ua: p.ua,
      ip: p.ip,
    };

    let result;
    if (existing) {
      // Use update() to ensure kvdex cleans up old secondary indices (like expiresAt)
      result = await this.#collection.update(
        // deno-lint-ignore no-explicit-any
        sessionId as unknown as ParseId<any>,
        // deno-lint-ignore no-explicit-any
        doc as any,
        {
          strategy: "replace",
          expireIn: this.#expireAfter ? this.#expireAfter * 1000 : undefined,
          // deno-lint-ignore no-explicit-any
        } as any,
      );
    } else {
      // For new sessions, use set()
      result = await this.#collection.set(
        // deno-lint-ignore no-explicit-any
        sessionId as unknown as ParseId<any>,
        // deno-lint-ignore no-explicit-any
        doc as any,
        {
          expireIn: this.#expireAfter ? this.#expireAfter * 1000 : undefined,
          overwrite: true,
          // deno-lint-ignore no-explicit-any
        } as any,
      );
    }

    if (!result.ok) {
      throw new Error(`Failed to set session ${sessionId}`);
    }
  }

  /**
   * Resolves a user from the user collection, optionally using a secondary index.
   */
  async resolveUser(userId: string): Promise<TUser | undefined> {
    if (!this.#userCollection) return undefined;

    let doc;
    if (this.#userIndex) {
      doc = await this.#userCollection.findBySecondaryIndex(
        // deno-lint-ignore no-explicit-any
        this.#userIndex as any,
        // deno-lint-ignore no-explicit-any
        userId as any,
      );
    } else {
      doc = await this.#userCollection.find(
        // deno-lint-ignore no-explicit-any
        userId as unknown as ParseId<any>,
      );
    }

    if (!doc) return undefined;

    // Handle potential PaginationResult
    // deno-lint-ignore no-explicit-any
    const validDoc = (doc as any).result ? (doc as any).result[0] : doc;
    if (!validDoc) return undefined;

    // We assume TUser matches doc.value
    // deno-lint-ignore no-explicit-any
    const value = validDoc.value as any;
    return value as TUser;
  }

  /**
   * Deletes session data from the kvdex collection.
   */
  async delete(sessionId: string): Promise<void> {
    await this.#collection.delete(
      // deno-lint-ignore no-explicit-any
      sessionId as unknown as ParseId<any>,
    );
  }
}
