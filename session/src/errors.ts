/**
 * @module
 * Custom error classes for the fresh-session library.
 */

/**
 * Base class for all session-related errors.
 */
export class SessionError extends Error {
  /**
   * Creates a new SessionError.
   * @param message The error message.
   */
  constructor(message: string) {
    super(message);
    this.name = "SessionError";
  }
}

/**
 * Thrown when an optimistic locking conflict occurs (version mismatch).
 */
export class SessionConflictError extends SessionError {
  /**
   * Creates a new SessionConflictError.
   * @param message The error message.
   */
  constructor(message = "Atomic update failed (version mismatch)") {
    super(message);
    this.name = "SessionConflictError";
  }
}

/**
 * Thrown when the session storage is misconfigured.
 */
export class SessionConfigError extends SessionError {
  /**
   * Creates a new SessionConfigError.
   * @param message The error message.
   */
  constructor(message: string) {
    super(message);
    this.name = "SessionConfigError";
  }
}

/**
 * Thrown when session data fails runtime validation.
 */
export class SessionValidationError extends SessionError {
  /**
   * Creates a new SessionValidationError.
   * @param message The error message.
   */
  constructor(message: string) {
    super(message);
    this.name = "SessionValidationError";
  }
}
