import { createDefine, type FreshContext } from "fresh";
import { getCookies, setCookie } from "@std/http/cookie";

export type SessionData = {
  name?: string;
  age?: number;
  admin?: boolean;
  // Allow other properties for flexibility or specific test cases
  [key: string]: unknown;
};

export type State<UserType = unknown> = {
  session: SessionData;
  sessionId: string;
  user?: UserType;
};

export interface SessionStorage {
  get(
    sessionId: string,
  ): Promise<SessionData | undefined> | SessionData | undefined;
  set(sessionId: string, data: SessionData): Promise<void> | void;
  delete(sessionId: string): Promise<void> | void;
}

export interface SessionOptions<UserType = unknown> {
  store: SessionStorage;
  cookie?: {
    name?: string;
    path?: string;
    domain?: string;
    secure?: boolean;
    httpOnly?: boolean;
    sameSite?: "Strict" | "Lax" | "None";
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
   */
  resolveUser?: (
    session: SessionData,
  ) => Promise<UserType | undefined> | UserType | undefined;
}

const define = createDefine<State>();

export function createSessionMiddleware<UserType = unknown>(
  options: SessionOptions<UserType>,
): (ctx: FreshContext<State>) => Promise<Response> {
  const cookieOptions = options.cookie || {};
  const cookieName = cookieOptions.name || "sessionId";
  const cookiePath = cookieOptions.path || "/";
  const cookieHttpOnly = cookieOptions.httpOnly ?? true;
  const cookieSecure = cookieOptions.secure ?? true;
  const cookieSameSite = cookieOptions.sameSite ?? "Lax";
  const sessionExpiry = options.expiry;

  return define.middleware(async (ctx: FreshContext<State>) => {
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
