import type { Context } from "fresh";
import { type Cookie, getCookies, setCookie } from "@std/http/cookie";

/**
 * Arbitrary session data storage.
 *
 * This type is used to type the session object in `ctx.state.session`.
 * It is extensible by default to allow any JSON-serializable data.
 */
export type SessionData = {
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
  /** The session data object. Accessing or modifying this affects only the user-space data. */
  session: SessionData;
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
  login(userId: string, data?: SessionData): Promise<void>;

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
 * Interface for session storage backends.
 */
export interface SessionStorage {
  /**
   * Retrieve session data by session ID.
   *
   * @param sessionId The unique session identifier.
   * @returns The session data, or undefined if not found/expired.
   */
  get(
    sessionId: string,
  ): Promise<unknown | undefined> | unknown | undefined;

  /**
   * Persist session data.
   *
   * @param sessionId The unique session identifier.
   * @param data The session data to store.
   */
  set(sessionId: string, data: unknown): Promise<void> | void;

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
export interface SessionOptions<UserType = unknown> {
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
  /** Session expiry in seconds. */
  expiry?: number;
  /**
   * Optional callback to resolve a user object from the session data.
   *
   * @param userId The user ID stored in the system fields.
   * @param session The current session data.
   */
  resolveUser?: (
    userId: string | undefined,
    session: SessionData,
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
}

/** Internal structure for stored sessions. */
interface StoredSession {
  data: SessionData;
  flash: Record<string, unknown>;
  userId?: string;
  ua?: string;
  ip?: string;
  lastSeenAt: number;
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
  AppState extends State = State,
  UserType = unknown,
>(
  options: SessionOptions<UserType>,
): (ctx: Context<AppState>) => Promise<Response> {
  const cookieOptions = options.cookie || {};
  const cookieName = cookieOptions.name || "sessionId";
  const cookiePath = cookieOptions.path || "/";
  const cookieHttpOnly = cookieOptions.httpOnly ?? true;
  const cookieSecure = cookieOptions.secure ?? true;
  const cookieSameSite = options.cookie?.sameSite ??
    "Lax" as Cookie["sameSite"];
  const sessionExpiry = options.expiry;

  return async (ctx: Context<AppState>) => {
    const cookies = getCookies(ctx.req.headers);
    let sessionId: string | undefined = cookies[cookieName];

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
    let storedSession: StoredSession = {
      data: {},
      flash: {},
      lastSeenAt: Date.now(),
      ua: currentUa,
      ip: currentIp,
    };

    const logout = async () => {
      if (sessionId) {
        await options.store.delete(sessionId);
      }
      sessionId = crypto.randomUUID();
      ctx.state.sessionId = sessionId;
      ctx.state.session = {};
      storedSession = {
        data: {},
        flash: {},
        lastSeenAt: Date.now(),
        ua: currentUa,
        ip: currentIp,
      };
    };

    if (sessionId) {
      const raw = await options.store.get(sessionId);
      if (raw) {
        // Check if it's the new structure
        if (typeof raw === "object" && "data" in raw && "flash" in raw) {
          storedSession = raw as StoredSession;

          // Validation
          if (options.trackUserAgent && storedSession.ua !== currentUa) {
            // Invalid UA, logout the user/terminate the session
            await logout();
          }
        } else {
          // Migration: Treat flat object as data
          storedSession.data = raw as SessionData;
          // Hydrate tracking info for migrated session
          storedSession.ua = currentUa;
          storedSession.ip = currentIp;
        }
      } else {
        // Invalid session ID (expired or fake)
        sessionId = undefined;
      }
    }

    if (!sessionId) {
      sessionId = crypto.randomUUID();
    }

    const initialSessionId = sessionId;

    // Helper to rotate session
    const rotateSession = async () => {
      await options.store.delete(initialSessionId);
      sessionId = crypto.randomUUID();
      ctx.state.sessionId = sessionId;
    };

    // Populate State
    ctx.state.sessionId = sessionId;
    ctx.state.session = storedSession.data;

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
    ctx.state.login = async (userId: string, data?: SessionData) => {
      await rotateSession();
      storedSession.userId = userId;
      storedSession.data = data || {};
      ctx.state.session = storedSession.data;
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

    if(ctx.state.user) {
      ctx.state.userId = storedSession.userId;
    }

    const response = await ctx.next();

    // Session rotation logic
    // If ctx.state.sessionId was modified manually (and doesn't match our tracked sessionId from login/init),
    // we interpret this as a request to rotate, but we enforce a secure random ID.
    if (ctx.state.sessionId !== sessionId) {
      await rotateSession();
    }

    // Prepare data for save
    // 1. Remove consumed flash messages from stored
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
    performFlashCleanup();

    // 2. Update System Fields
    storedSession.lastSeenAt = Date.now();
    // Ensure accurate tracking on save (in case of rotation or migration)
    if (options.trackUserAgent) storedSession.ua = currentUa;
    if (options.trackIp) storedSession.ip = currentIp;

    // UserId persisted from check or login
    // UserId persisted from check or login

    // Save
    await options.store.set(sessionId, storedSession);

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
  };
}
