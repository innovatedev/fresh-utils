# Session Middleware Evaluation Standard

A weighted scoring framework for evaluating session middleware against four
domains. Each criterion is scored **0–4**. The weighted total out of **100**
determines the overall rating.

---

## Scoring scale (per criterion)

| Score | Meaning                              |
| ----- | ------------------------------------ |
| 0     | Broken or completely absent          |
| 1     | Present but seriously inadequate     |
| 2     | Partially meets the requirement      |
| 3     | Meets the standard                   |
| 4     | Meaningfully exceeds the requirement |

---

## Domain 1 — Security (35 pts)

### Session ID generation — 10 pts

IDs must be cryptographically random with at minimum 128 bits of entropy.
Predictable, sequential, or short IDs are an immediate failure.

### Transport security — 9 pts

Cookies must be `Secure`, `HttpOnly`, and carry an appropriate `SameSite` policy
(`Strict` or `Lax`). Any deviation without explicit justification is penalized.

### Session invalidation — 9 pts

Must support explicit logout, absolute timeout, and idle timeout. Server-side
invalidation must make the token immediately unusable.

### Fixation protection — 7 pts

Session ID must be regenerated on privilege escalation (login, role change). The
old ID must be invalidated server-side.

---

## Domain 2 — Correctness & Reliability (22 pts)

### Concurrency safety — 9 pts

Concurrent requests sharing a session must not race or corrupt state. Reads and
writes should be atomic or use explicit locking.

### Persistence correctness — 7 pts

Session data written must be readable on subsequent requests, including across
process restarts when a persistent store is configured.

### Error handling — 6 pts

Store failures must be surfaced gracefully. The middleware must never silently
swallow errors or serve stale session data after a store fault.

---

## Domain 3 — Performance & Scalability (18 pts)

### Store I/O overhead — 9 pts

Session reads/writes should not be on the critical path for every request unless
necessary. Lazy loading and write-on-change are encouraged.

### Store pluggability — 9 pts

Must support swappable backends (in-memory, Redis, DB). Hard-coded or
non-replaceable stores are penalized. The adapter interface must be documented.

---

## Domain 4 — Developer Experience (25 pts)

### Flash / one-time data — 5 pts

Must support data that auto-clears after the next request. This is table stakes
for form errors, redirect messages, and success notices. Without it, developers
build fragile workarounds.

### Ease of use — 5 pts

Setup should require minimal boilerplate. Common operations (get, set, destroy,
regenerate) must be simple, consistent, and intuitive without reading source
code. The happy path should be obvious.

### Typed session data — 4 pts

Should support typed or schema-validated session payloads. Good DX means
autocomplete and runtime shape validation — not everything typed as `any` or
untyped.

### Middleware composability — 4 pts

Must layer cleanly with auth, CSRF, and other middleware without
order-of-operations footguns. Should expose lifecycle hooks (before/after read,
before/after write) for extensibility.

### Configuration ergonomics — 4 pts

Defaults must be secure out of the box. Insecure options must be explicitly
opted into. Misconfigurations should be caught at startup with clear, actionable
error messages — not cryptic runtime failures.

### Diagnostics & logging — 3 pts

Key lifecycle events (create, refresh, destroy, expiry) should be emittable.
Debug logging must be opt-in and must never log session payloads in production.

### Documentation & test coverage — 3 pts

Public API must be fully documented. A test suite must cover edge cases: expired
sessions, concurrent access, invalid tokens, flash lifecycle, and store
failures.

### Migration & versioning — 2 pts

When session schema changes, there must be a path for rolling migrations without
mass logouts. Session payloads should support versioning or graceful fallback
for older formats.

---

## Rating bands

| Score    | Rating                   | Meaning                                                                                                                                               | Recommendation                                                                                             |
| -------- | ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| 0 – 49   | **Failure**              | One or more critical security flaws, persistent data loss, or unsafe defaults that expose users to exploitation.                                      | Do not use. Report issues upstream. Consider replacing entirely.                                           |
| 50 – 69  | **Sub-standard**         | Meets the bare minimum in most areas but has significant gaps: weak defaults, missing invalidation paths, no flash support, or no store pluggability. | Acceptable only for low-risk internal tools with close monitoring. Do not use for authenticated user data. |
| 70 – 84  | **Acceptable**           | Secure, correct, and reasonably performant. Some gaps in observability or DX but no blocking issues for production use.                               | Suitable for production. Document known gaps and mitigate at the application layer if needed.              |
| 85 – 100 | **Exceeds expectations** | Strong security posture, race-free, pluggable, typed, flash-capable, well-documented, with good defaults and lifecycle observability.                 | Recommended. Suitable for all production use cases including high-traffic and regulated environments.      |

---

## Automatic failure conditions

Any of the following results in a **Failure** rating regardless of overall
score:

- Session IDs with fewer than 128 bits of cryptographic entropy
- No server-side session invalidation on logout
- Session ID not regenerated after authentication (fixation vulnerability)
- Session payload stored or logged in plaintext in an accessible location
  without encryption at rest
- No absolute session expiry enforced

---

## Scoring worksheet

| Criterion                | Domain      | Weight  | Score (0–4) | Weighted pts |
| ------------------------ | ----------- | ------- | ----------- | ------------ |
| Session ID generation    | Security    | 10      |             |              |
| Transport security       | Security    | 9       |             |              |
| Session invalidation     | Security    | 9       |             |              |
| Fixation protection      | Security    | 7       |             |              |
| Concurrency safety       | Correctness | 9       |             |              |
| Persistence correctness  | Correctness | 7       |             |              |
| Error handling           | Correctness | 6       |             |              |
| Store I/O overhead       | Performance | 9       |             |              |
| Store pluggability       | Performance | 9       |             |              |
| Flash / one-time data    | DX          | 5       |             |              |
| Ease of use              | DX          | 5       |             |              |
| Typed session data       | DX          | 4       |             |              |
| Middleware composability | DX          | 4       |             |              |
| Configuration ergonomics | DX          | 4       |             |              |
| Diagnostics & logging    | DX          | 3       |             |              |
| Documentation & tests    | DX          | 3       |             |              |
| Migration & versioning   | DX          | 2       |             |              |
| **Total**                |             | **100** |             |              |

> **Weighted pts formula:** `(score / 4) × weight`, rounded to nearest integer.
