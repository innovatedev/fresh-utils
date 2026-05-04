/**
 * @module
 *
 * Core session logic and types.
 *
 * Contains the `createSessionMiddleware` factory and typescript interfaces
 * for Session, State, and Storage.
 */
import type { Context } from "fresh";
import { type Cookie, getCookies, setCookie } from "@std/http/cookie";
import { CURRENT_SESSION_FORMAT_VERSION, migrate } from "./migrations.ts";
import { SessionConflictError } from "./errors.ts";

export type { Context };

/**
 * Arbitrary session data storage.
 *
 * This type is used to type the session object in `ctx.state.session`.
 * It is extensible by default to allow any JSON-serializable data.
 */
export type SessionData = {
  [key: string]: unknown;
};

/**
 * Result of a session update operation.
 */
export type UpdateResult<T> =
  | { ok: true; data: T }
  | { ok: false; reason: "exhausted" | "store_error" | "not_found" };

/**
 * Interface for the session object in ctx.state.
 */
export interface Session<TData = SessionData> {
  /**
   * The underlying session data.
   */
  readonly data: TData;

  /**
   * Performs an atomic update on the session data with an automatic retry strategy.
   * Useful for concurrent mutations (e.g. counters, cart updates).
   *
   * @param transform A function that receives the freshest data and returns the updated data.
   * @param options Configuration for the retry loop.
   */
  update<T = TData>(
    transform: (data: T) => T | Promise<T>,
    options?: {
      maxRetries?: number;
      onExhausted?: "warn" | "throw";
    },
  ): Promise<UpdateResult<T>>;
}

/**
 * The state object utilized by the session middleware.
 *
 * This augments the standard Fresh state with session-specific properties.
 *
 * @template UserType The type of the user object resolved by `resolveUser`.
 */
export type State<UserType = unknown, TData = SessionData> = {
  /** The session object. Proxy-wrapped to allow direct property access and methods. */
  session: TData & Session<TData>;
  /** The unique session identifier. */
  sessionId: string;
  /** The resolved user object (if configured). */
  user?: UserType;
  /** The unique user identifier (if configured). */
  userId?: string;

  /**
   * Log in a user.
   *
   * This rotates the session ID for security, sets the user ID system field,
   * and initializes the session data.
   *
   * @param userId The unique identifier for the user.
   * @param data Optional initial session data.
   */
  login(userId: string, data?: TData): Promise<void>;

  /**
   * Log out the current user.
   *
   * Destroys the current session, clears the cookie, and resets the state.
   */
  logout(): Promise<void>;

  /**
   * Get a flash message by key, consuming it (it will be removed after this request).
   *
   * @param key The key of the flash message.
   */
  flash(key: string): unknown;

  /**
   * Set a flash message for the next request.
   *
   * @param key The key of the flash message.
   * @param value The value to store.
   */
  flash(key: string, value: unknown): void;

  /**
   * Check if a flash message exists without consuming it.
   *
   * @param key The key of the flash message.
   */
  hasFlash(key: string): boolean;
};

/**
 * Interface for the library logger.
 */
export interface SessionLogger {
  /** Log a warning message. */
  warn(message: string, ...args: unknown[]): void;
  /** Log an error message. */
  error(message: string, ...args: unknown[]): void;
  /** Log a debug message. */
  debug?(message: string, ...args: unknown[]): void;
}

/**
 * Interface for session storage backends.
 */
export interface SessionStorage {
  /**
   * Retrieve session data by session ID.
   *
   * @param sessionId The unique session identifier.
   * @returns The session data and its version, or undefined if not found/expired.
   */
  get(
    sessionId: string,
  ):
    | Promise<StoredSession<unknown> & { version?: string } | undefined>
    | StoredSession<unknown> & { version?: string }
    | undefined;

  /**
   * Persist session data.
   *
   * @param sessionId The unique session identifier.
   * @param data The session data to store.
   * @param version The version of the session data that was read, for optimistic locking.
   * @throws Error if the save fails (e.g. version mismatch).
   */
  set(
    sessionId: string,
    data: unknown,
    version?: string,
  ): Promise<void> | void;

  /**
   * Delete a session.
   *
   * @param sessionId The unique session identifier to remove.
   */
  delete(sessionId: string): Promise<void> | void;
  /**
   * Optional method to resolve a user from the session ID or other stored data.
   * This allows the store to handle user fetching logic (e.g. from KV).
   */
  resolveUser?(
    userId: string,
  ): Promise<unknown | undefined> | unknown | undefined;
}

/**
 * Configuration options for the session middleware.
 *
 * @template UserType The type of the resolved user object.
 */
export interface SessionOptions<UserType = unknown, TData = SessionData> {
  /** The storage backend instance. */
  store: SessionStorage;
  /** Configuration for the session cookie. */
  cookie?: {
    name?: string;
    path?: string;
    domain?: string;
    secure?: boolean;
    httpOnly?: boolean;
    sameSite?: "Strict" | "Lax" | "None";
    maxAge?: number;
  };
  /** Session expiry in seconds (idle timeout). */
  expiry?: number;
  /**
   * Absolute session expiry in seconds.
   * If provided, sessions will be invalidated after this duration from creation,
   * regardless of activity.
   */
  absoluteExpiry?: number;
  /**
   * Optional callback to resolve a user object from the session data.
   *
   * @param userId The user ID stored in the system fields.
   * @param session The current session data.
   */
  resolveUser?: (
    userId: string | undefined,
    session: TData,
  ) => Promise<UserType | undefined> | UserType | undefined;
  /**
   * Whether to track and validate the User-Agent string.
   * If enabled, sessions will be invalidated if the User-Agent changes.
   */
  trackUserAgent?: boolean;
  /**
   * Whether to track the client IP address.
   * If true, uses `ctx.remoteAddr`.
   * If an object with `header` is provided, likely for proxies, uses that header.
   */
  trackIp?: boolean | { header: string };
  /**
   * The name of the header to check for an API token (e.g. "Authorization").
   * Defaults to "Authorization".
   */
  tokenHeader?: string;
  /**
   * Callback to verify an API token.
   * If this returns a user, the request is treated as a stateless API request:
   * - `ctx.state.user` is populated.
   * - `ctx.state.session` is empty (and changes are discarded).
   * - No session cookie is set.
   */
  verifyToken?: (
    token: string,
  ) => Promise<UserType | undefined> | UserType | undefined;

  /**
   * The prefix to expect in the token header (e.g. "Bearer ").
   * Defaults to "Bearer ".
   * Set to `null` or empty string to disable prefix stripping.
   */
  tokenPrefix?: string | null;
  /**
   * Optional callback for session lifecycle events.
   * Useful for diagnostics, logging, and metrics.
   */
  onEvent?: (event: {
    type: "create" | "refresh" | "destroy" | "rotate" | "expired";
    sessionId: string;
    userId?: string;
  }) => void;
  /**
   * Optional custom logger for library events and errors.
   * Defaults to global `console`.
   */
  logger?: SessionLogger;
}

/** Internal structure for stored sessions. */
export interface StoredSession<TData = SessionData> {
  /** Schema version of the session record. */
  __v: number;
  /** The user-defined session data. */
  data: TData;
  /** Internal flash message storage. */
  flash: Record<string, unknown>;
  /** The unique user identifier (if logged in). */
  userId?: string;
  /** Captured User-Agent string for validation. */
  ua?: string;
  /** Captured Client IP address for validation. */
  ip?: string;
  /** Timestamp of the session creation (for absolute timeout). */
  createdAt: number;
  /** Timestamp of the last user interaction (for idle timeout). */
  lastSeenAt: number;
}

/**
 * Generates a cryptographically secure 128-bit session ID.
 */
function generateSessionId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Creates the session middleware.
 *
 * This middleware handles session retrieval, rotation, and persistence.
 * It also populates `ctx.state.session` and other session-related properties.
 *
 * @template AppState The application state type (must extend `State`).
 * @template UserType The type of the user object (if user resolution is used).
 *
 * @param options Configuration options for the middleware.
 * @returns A Fresh middleware function.
 */
export function createSessionMiddleware<
  // deno-lint-ignore no-explicit-any
  AppState extends State<UserType, TData> = State<any, any>,
  UserType = unknown,
  TData = SessionData,
>(
  options: SessionOptions<UserType, TData>,
): (ctx: Context<AppState>) => Promise<Response> {
  const cookieOptions = options.cookie || {};
  const cookieName = cookieOptions.name || "sessionId";
  const cookiePath = cookieOptions.path || "/";
  const cookieHttpOnly = cookieOptions.httpOnly ?? true;
  const cookieSecure = cookieOptions.secure ?? true;
  const cookieSameSite = options.cookie?.sameSite ??
    "Lax" as Cookie["sameSite"];
  const sessionExpiry = options.expiry;
  const absoluteExpiry = options.absoluteExpiry;
  const logger = options.logger ?? console;

  return async (ctx: Context<AppState>) => {
    // 1. API Token Flow (Stateless)
    if (options.verifyToken) {
      const headerName = options.tokenHeader || "Authorization";
      const headerVal = ctx.req.headers.get(headerName);
      if (headerVal) {
        let token = headerVal;
        const prefix = options.tokenPrefix !== undefined
          ? options.tokenPrefix
          : "Bearer ";

        if (prefix && headerVal.startsWith(prefix)) {
          token = headerVal.slice(prefix.length);
        }

        const user = await options.verifyToken(token);
        if (user) {
          // Valid API Request
          ctx.state.user = user as unknown as AppState["user"];
          ctx.state.session = {} as AppState["session"]; // Stateless
          ctx.state.sessionId = generateSessionId(); // Ephemeral

          // No-op Flash info
          ctx.state.flash = (_key: string, _value?: unknown) => {
            return undefined;
          };
          ctx.state.hasFlash = (_key: string) => false;

          // No-op Login/Logout for API
          ctx.state.login = (_userId: string, _data?: TData) =>
            Promise.resolve();
          ctx.state.logout = () => Promise.resolve();

          return ctx.next();
        }
      }
    }

    // 2. Standard Session Flow (Cookie-based)
    const cookies = getCookies(ctx.req.headers);
    let sessionId: string | undefined = cookies[cookieName];
    const initialSessionId = sessionId;

    // Capture Client Signals
    let currentUa: string | undefined;
    if (options.trackUserAgent) {
      currentUa = ctx.req.headers.get("user-agent") || undefined;
    }

    let currentIp: string | undefined;
    if (options.trackIp) {
      if (typeof options.trackIp === "object" && options.trackIp.header) {
        currentIp = ctx.req.headers.get(options.trackIp.header) || undefined;
      } else {
        // Fallback to remoteAddr
        const addr = ctx.info.remoteAddr as Deno.NetAddr;
        currentIp = addr.hostname;
      }
    }

    // Internal state
    let storedSession: StoredSession<TData> = {
      __v: CURRENT_SESSION_FORMAT_VERSION,
      data: {} as TData,
      flash: {},
      createdAt: Date.now(),
      lastSeenAt: Date.now(),
      ua: currentUa,
      ip: currentIp,
    };

    const logout = async (reason: "destroy" | "expired" = "destroy") => {
      if (sessionId) {
        await options.store.delete(sessionId);
        options.onEvent?.({
          type: reason === "expired" ? "expired" : "destroy",
          sessionId,
          userId: storedSession.userId,
        });
      }
      sessionId = generateSessionId();
      ctx.state.sessionId = sessionId;
      initialVersion = undefined;
      ctx.state.session = {} as AppState["session"];
      storedSession = {
        __v: CURRENT_SESSION_FORMAT_VERSION,
        data: {} as TData,
        flash: {},
        createdAt: Date.now(),
        lastSeenAt: Date.now(),
        ua: currentUa,
        ip: currentIp,
      };
    };

    let initialVersion: string | undefined;

    if (sessionId) {
      try {
        const raw = await options.store.get(sessionId);
        if (raw) {
          initialVersion = raw.version;
          storedSession = migrate(raw) as StoredSession<TData>;

          // 1. Validation: User Agent
          if (options.trackUserAgent && storedSession.ua !== currentUa) {
            await logout();
          }

          // 2. Validation: Expiry (Server-side enforcement)
          const now = Date.now();
          if (sessionExpiry) {
            const idleTimeout = now - storedSession.lastSeenAt >
              sessionExpiry * 1000;
            if (idleTimeout) {
              await logout("expired");
            }
          }

          if (absoluteExpiry) {
            const absoluteTimeout = now - storedSession.createdAt >
              absoluteExpiry * 1000;
            if (absoluteTimeout) {
              await logout("expired");
            }
          }
        } else {
          // Invalid session ID (expired or fake)
          sessionId = undefined;
        }
      } catch (error) {
        console.error("[session] Store get error:", error);
        // On store error, we treat it as an invalid session to be safe
        sessionId = undefined;
      }
    }

    let isNewSession = false;
    if (!sessionId) {
      sessionId = generateSessionId();
      isNewSession = true;
    }
    let forceSave = false;

    // Helper to rotate session
    const rotateSession = async () => {
      try {
        await options.store.delete(initialSessionId);
      } catch (error) {
        logger.error("[session] Store delete error during rotation:", error);
      }
      sessionId = generateSessionId();
      ctx.state.sessionId = sessionId;
      forceSave = true;
      initialVersion = undefined;
      options.onEvent?.({
        type: "rotate",
        sessionId,
        userId: storedSession.userId,
      });
    };

    // Internal state tracking
    let sessionData = storedSession.data;

    // Use Proxy to provide direct property access while adding methods
    const sessionObject = new Proxy(sessionData as TData & Session<TData>, {
      get(target, prop, receiver) {
        if (prop === "update") {
          return async (
            transform: (data: TData) => TData | Promise<TData>,
            updateOptions?: {
              maxRetries?: number;
              onExhausted?: "warn" | "throw";
            },
          ): Promise<UpdateResult<TData>> => {
            const maxRetries = updateOptions?.maxRetries ?? 3;
            const onExhausted = updateOptions?.onExhausted ?? "warn";
            let attempts = 0;
            while (attempts < maxRetries) {
              try {
                const current = await options.store.get(sessionId!);
                if (!current) return { ok: false, reason: "not_found" };

                const newData = await transform(current.data as TData);
                await options.store.set(
                  sessionId!,
                  {
                    ...current,
                    data: newData,
                    lastSeenAt: Date.now(),
                  },
                  current.version,
                );

                // Synchronize local state
                storedSession.data = newData;
                sessionData = newData;
                // Update original state to prevent redundant final save
                originalData = JSON.stringify(newData);
                originalLastSeen = Date.now();

                // Update proxy target so subsequent reads see change
                Object.assign(target as object, newData);
                return { ok: true, data: newData };
              } catch (error) {
                attempts++;
                if (attempts >= maxRetries) {
                  if (onExhausted === "throw") {
                    throw error;
                  }
                  logger.warn("[session] Update exhausted retries:", error);
                  return { ok: false, reason: "exhausted" };
                }
                // Optional: small delay between retries
                await new Promise((r) => setTimeout(r, Math.random() * 50));
              }
            }
            return { ok: false, reason: "exhausted" };
          };
        }
        if (prop === "data") return sessionData;
        return Reflect.get(target, prop, receiver);
      },
      set(target, prop, value, receiver) {
        return Reflect.set(target, prop, value, receiver);
      },
    });

    // Populate State
    ctx.state.sessionId = sessionId;
    ctx.state.session = sessionObject as AppState["session"];

    // Implement Flash API
    // We need to track consumed flash messages to remove them on save
    const consumedFlash = new Set<string>();
    const newFlash: Record<string, unknown> = {};

    ctx.state.flash = (key: string, value?: unknown): unknown => {
      if (value === undefined) {
        // Get
        if (key in storedSession.flash) {
          consumedFlash.add(key);
          return storedSession.flash[key];
        }
        return undefined;
      } else {
        // Set
        newFlash[key] = value;
      }
    };

    ctx.state.hasFlash = (key: string): boolean => {
      return key in storedSession.flash || key in newFlash;
    };

    // Implement Login/Logout
    ctx.state.login = async (userId: string, data?: TData) => {
      await rotateSession();
      storedSession.userId = userId;
      storedSession.data = data || ({} as TData);
      ctx.state.session = storedSession.data as AppState["session"];
    };

    ctx.state.logout = logout;

    // User Resolution
    if (options.resolveUser) {
      const resolved = await options.resolveUser(
        storedSession.userId,
        storedSession.data,
      );
      if (resolved) {
        ctx.state.user = resolved as unknown as AppState["user"];
      }
    } else if (storedSession.userId && options.store.resolveUser) {
      // Fallback to store resolution
      const resolved = await options.store.resolveUser(storedSession.userId);
      if (resolved) {
        ctx.state.user = resolved as unknown as AppState["user"];
      }
    }

    if (ctx.state.user) {
      ctx.state.userId = storedSession.userId;
    }

    // Save only if dirty (data changed, flash changed, or session is new/rotated)
    // OR if lastSeenAt is old enough to warrant an update (e.g. > 10% of expiry)
    let originalData = JSON.stringify(storedSession.data);
    const originalFlash = JSON.stringify(storedSession.flash);
    let originalLastSeen = storedSession.lastSeenAt;

    // Helper to cleanup flash messages
    const performFlashCleanup = () => {
      const nextFlash: Record<string, unknown> = {};
      // Keep unconsumed old flash
      for (const [k, v] of Object.entries(storedSession.flash)) {
        if (!consumedFlash.has(k)) {
          nextFlash[k] = v;
        }
      }
      // Add new flash
      for (const [k, v] of Object.entries(newFlash)) {
        nextFlash[k] = v;
      }
      storedSession.flash = nextFlash;
    };

    const response = await ctx.next();

    // Session rotation logic
    if (ctx.state.sessionId !== sessionId) {
      await rotateSession();
    }

    // Prepare data for save
    performFlashCleanup();

    const dataChanged = originalData !== JSON.stringify(storedSession.data);
    const flashChanged = originalFlash !== JSON.stringify(storedSession.flash);
    const now = Date.now();
    // Update lastSeenAt if data changed or every 1 minute to keep session alive
    const shouldUpdateLastSeen = flashChanged || dataChanged ||
      (now - originalLastSeen > 60000);

    if (
      isNewSession || dataChanged || flashChanged || shouldUpdateLastSeen ||
      forceSave
    ) {
      storedSession.lastSeenAt = now;
      if (options.trackUserAgent) storedSession.ua = currentUa;
      if (options.trackIp) storedSession.ip = currentIp;

      try {
        await options.store.set(
          sessionId,
          storedSession,
          initialVersion,
        );

        if (isNewSession) {
          options.onEvent?.({
            type: "create",
            sessionId,
            userId: storedSession.userId,
          });
        } else if (shouldUpdateLastSeen && !dataChanged && !flashChanged) {
          options.onEvent?.({
            type: "refresh",
            sessionId,
            userId: storedSession.userId,
          });
        }
      } catch (error) {
        if (error instanceof SessionConflictError) {
          logger.warn(
            `[session] Optimistic locking failure for session ${sessionId}. Concurrent modification detected.`,
          );
        } else {
          logger.error(
            `[session] Final save failed for session ${sessionId}:`,
            error,
          );
        }
      }
    }

    if (
      isNewSession || sessionId !== initialSessionId || dataChanged ||
      flashChanged || shouldUpdateLastSeen || forceSave
    ) {
      setCookie(response.headers, {
        name: cookieName,
        value: sessionId,
        path: cookiePath,
        httpOnly: cookieHttpOnly,
        secure: cookieSecure,
        sameSite: cookieSameSite,
        maxAge: cookieOptions.maxAge ?? sessionExpiry,
      });
    }

    return response;
  };
}

/**
 * Middleware that allows only guest users (not logged in).
 * If the user is logged in, they are redirected to the specified path.
 *
 * @param redirect The path to redirect to if the user is logged in. Defaults to "/".
 */
export function guestOnlyMiddleware<T = unknown>(
  redirect = "/",
): (ctx: Context<T>) => Promise<Response> {
  return async (ctx: Context<T>) => {
    if ((ctx.state as { user?: unknown }).user) {
      return ctx.redirect(redirect);
    }
    return await ctx.next();
  };
}

/**
 * Middleware that allows only authenticated users.
 * If the user is not logged in, they are redirected to the specified path.
 *
 * @param redirect The path to redirect to if the user is not logged in. Defaults to "/login".
 */
export function authOnlyMiddleware<T = unknown>(
  redirect = "/login",
): (ctx: Context<T>) => Promise<Response> {
  return async (ctx: Context<T>) => {
    if (!(ctx.state as { user?: unknown }).user) {
      return ctx.redirect(redirect);
    }
    return await ctx.next();
  };
}
