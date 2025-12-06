import { type Context, createDefine } from "fresh";
import { getCookies, setCookie } from "@std/http/cookie";

/**
 * Arbitrary session data storage.
 *
 * This type is used to type the session object in `ctx.state.session`.
 * It is extensible by default to allow any JSON-serializable data.
 *
 * @example
 * ```ts
 * // Extend for type safety
 * interface MySession extends SessionData {
 *   userId: string;
 *   cartId?: string;
 * }
 * ```
 */
export type SessionData = {
  name?: string;
  age?: number;
  admin?: boolean;
  // Allow other properties for flexibility or specific test cases
  [key: string]: unknown;
};

/**
 * The state object utilized by the session middleware.
 *
 * This augments the standard Fresh state with session-specific properties.
 *
 * @template UserType The type of the user object resolved by `resolveUser`.
 */
export type State<UserType = unknown> = {
  /** The session data object. */
  session: SessionData;
  /** The unique session identifier. */
  sessionId: string;
  /** The resolved user object (if configured). */
  user?: UserType;
};

/**
 * Interface for session storage backends.
 *
 * Implement this interface to create custom session stores (e.g., Redis, Postgres).
 */
export interface SessionStorage {
  /**
   * Retrieve session data by ID.
   * @param sessionId The session ID to look up.
   * @returns The session data if found, or undefined.
   */
  get(
    sessionId: string,
  ): Promise<SessionData | undefined> | SessionData | undefined;
  /**
   * Save session data.
   * @param sessionId The session ID to save.
   * @param data The session data to store.
   */
  set(sessionId: string, data: SessionData): Promise<void> | void;
  /**
   * Delete a session by ID.
   * @param sessionId The session ID to delete.
   */
  delete(sessionId: string): Promise<void> | void;
}

/**
 * Configuration options for the session middleware.
 *
 * @template UserType The type of the resolved user object.
 */
export interface SessionOptions<UserType = unknown> {
  /** The storage backend instance (e.g., MemorySessionStorage, DenoKvSessionStorage). */
  store: SessionStorage;
  /** Configuration for the session cookie. */
  cookie?: {
    /** Cookie name (default: "sessionId"). */
    name?: string;
    /** Cookie path (default: "/"). */
    path?: string;
    /** Cookie domain. */
    domain?: string;
    /** Secure flag (default: true). */
    secure?: boolean;
    /** HttpOnly flag (default: true). */
    httpOnly?: boolean;
    /** SameSite attribute (default: "Lax"). */
    sameSite?: "Strict" | "Lax" | "None";
    /** MaxAge in seconds. */
    maxAge?: number;
  };
  /**
   * Session expiry in seconds.
   * If set, this will be used for the cookie maxAge (if not explicitly set in cookie options)
   * and potentially for the store if supported.
   */
  expiry?: number;
  /**
   * Optional callback to resolve a user object from the session data.
   * The result will be available in ctx.state.user.
   *
   * @param session The current session data.
   * @returns A promise resolving to the user object, or the user object directly.
   */
  resolveUser?: (
    session: SessionData,
  ) => Promise<UserType | undefined> | UserType | undefined;
}

const define = createDefine<State>();

/**
 * Creates the session middleware.
 *
 * This function returns a Fresh middleware that handles session hydration,
 * persistence, and cookie management.
 *
 * @template UserType The type of the user object to resolve.
 * @param options Configuration options for the middleware.
 * @returns A Fresh middleware function.
 *
 * @example
 * ```ts
 * // config/session.ts
 * import { createSessionMiddleware } from "@innovatedev-fresh/session";
 * import { DenoKvSessionStorage } from "@innovatedev-fresh/session/kv-store";
 *
 * const kv = await Deno.openKv();
 *
 * export const sessionMiddleware = createSessionMiddleware({
 *   store: new DenoKvSessionStorage(kv),
 *   cookie: { name: "mysession", secure: true },
 * });
 * ```
 */
export function createSessionMiddleware<UserType = unknown>(
  options: SessionOptions<UserType>,
): (ctx: Context<State>) => Promise<Response> {
  const cookieOptions = options.cookie || {};
  const cookieName = cookieOptions.name || "sessionId";
  const cookiePath = cookieOptions.path || "/";
  const cookieHttpOnly = cookieOptions.httpOnly ?? true;
  const cookieSecure = cookieOptions.secure ?? true;
  const cookieSameSite = cookieOptions.sameSite ?? "Lax";
  const sessionExpiry = options.expiry;

  return define.middleware(async (ctx: Context<State>) => {
    const cookies = getCookies(ctx.req.headers);
    let sessionId = cookies[cookieName];
    let sessionData: SessionData | undefined;

    if (sessionId) {
      sessionData = await options.store.get(sessionId);
    }

    if (!sessionData) {
      sessionId = crypto.randomUUID();
      sessionData = {};
    }

    const initialSessionId = sessionId;

    ctx.state.session = sessionData;
    ctx.state.sessionId = sessionId;

    // Resolve user if callback provided and we have session data (even empty, though typically user data is needed)
    if (options.resolveUser && sessionData) {
      ctx.state.user = await options.resolveUser(sessionData);
    }

    const response = await ctx.next();

    if (ctx.state.sessionId !== initialSessionId) {
      // Session rotation detected
      await options.store.delete(initialSessionId);
      // Force a new secure ID
      sessionId = crypto.randomUUID();
      ctx.state.sessionId = sessionId;
    }

    // Save session data
    await options.store.set(sessionId, ctx.state.session);

    // Set cookie
    setCookie(response.headers, {
      name: cookieName,
      value: sessionId,
      path: cookiePath,
      httpOnly: cookieHttpOnly,
      secure: cookieSecure,
      sameSite: cookieSameSite,
      maxAge: cookieOptions.maxAge ?? sessionExpiry,
    });

    return response;
  });
}
