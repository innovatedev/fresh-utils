# Session Middleware Evaluation Standard

A weighted scoring framework for evaluating session middleware across any
server-side framework. Each criterion is scored **0–4**. The weighted total out
of **100** determines the overall rating.

> **Standard version: 3.0** — Domain weights updated in v0.8.0 to reflect the
> addition of `Crash Resilience` as an independently scored criterion.

---

## Scoring scale (per criterion)

| Score | Meaning                              |
| ----- | ------------------------------------ |
| 0     | Broken, absent, or actively harmful  |
| 1     | Present but seriously inadequate     |
| 2     | Partially meets the requirement      |
| 3     | Meets the standard                   |
| 4     | Meaningfully exceeds the requirement |

---

## Domain 1 — Security (35 pts)

### Session ID generation — 10 pts

IDs must be cryptographically random with at minimum 128 bits of entropy,
generated via a CSPRNG. Predictable, sequential, UUIDs v4 without a CSPRNG
source, or short IDs are an immediate failure. The generation path must be
auditable — no black-box third-party ID generation without source verification.

### Transport security — 9 pts

Cookies must default to `Secure`, `HttpOnly`, and a `SameSite` policy of
`Strict` or `Lax`. Insecure configurations must require explicit opt-in with no
ambiguity. Token-based transports (header, query string) must be documented as
insecure for browser contexts. Score 0 if any insecure default is present
without explicit developer action.

### Session invalidation — 9 pts

Must support: explicit server-side logout (token immediately unusable), idle
timeout, and absolute timeout. Idle and absolute timeouts must be enforced
server-side — client-side expiry alone is not sufficient. Expired sessions must
be cleaned up from the store, not just marked invalid.

### Fixation protection — 7 pts

Session ID must be regenerated on any privilege escalation: login, role change,
sudo-style elevation. The old ID must be invalidated server-side before the
response is sent. Regeneration must be triggered automatically by the provided
login helper, not left to the developer to remember.

---

## Domain 2 — Correctness & Reliability (25 pts)

### Concurrency safety — 10 pts

Concurrent requests sharing a session must not silently corrupt state.
Acceptable models, in order of preference:

- Strongly consistent atomic writes with conflict detection (versionstamp, CAS)
- Optimistic concurrency with guaranteed recovery path (WAL or equivalent)
- Optimistic concurrency with conflict detection and documented first-write-wins
  behavior

Last-write-wins with no conflict detection scores 0. The conflict resolution
path must be explicitly documented and tested — "atomic" in the docs without a
test demonstrating conflict behavior scores no higher than 2.

### Crash resilience — 8 pts

If the process crashes mid-write, the store must reach a consistent state on
recovery. Acceptable models:

- Write-Ahead Log with background reconciliation on startup
- Idempotent writes that are safe to replay
- Native store TTL that automatically expires orphaned partial writes

A crash window that permanently corrupts or silently loses session data
scores 0. Eventual consistency is acceptable if recovery is guaranteed and the
recovery path is tested.

### Persistence correctness — 7 pts

Session data written must be readable on subsequent requests, including across
process restarts when a persistent store is configured. Write-after-read
consistency must be guaranteed for the primary session record. Test coverage
must include: write then read, restart then read, concurrent write then read.

---

## Domain 3 — Performance & Scalability (18 pts)

### Store I/O efficiency — 9 pts

The middleware must not perform redundant store reads or writes. Write-on-change
(dirty tracking) is required — unchanged sessions must not trigger a store
write. Reads must be minimized; multiple reads per request for the same session
data are penalized. Heartbeat/refresh operations must be throttled, not
triggered on every request.

### Store pluggability — 9 pts

Must support swappable backends via a documented adapter interface. The
interface contract must be explicit — required methods, expected error behavior,
and consistency guarantees must be specified. Hard-coded stores with no
replacement path score 0. Stores that silently degrade behavior when
misconfigured (e.g., falling back to non-atomic writes without a startup error)
score no higher than 2.

---

## Domain 4 — Developer Experience (22 pts)

### Flash / one-time data — 4 pts

Must support data that auto-clears after it is read. The lifecycle must be: set
on request N, readable on request N+1, absent on request N+2. This must work
correctly across redirects. The flash API must be tested across the full
redirect cycle, not just unit-tested in isolation.

### Ease of use — 4 pts

Setup must be achievable with minimal boilerplate. Common operations (read,
write, destroy, rotate) must be intuitive without reading source code. The happy
path must be documented with a working example. Footguns (e.g., operations that
appear safe but are not) must be called out explicitly.

### Typed session data — 4 pts

Session payloads must be typed end-to-end. The type must flow from configuration
through to handler access with no `any` gaps. Runtime shape validation (schema
enforcement on read) is required for a score of 4. TypeScript inference that
requires manual casting scores no higher than 2.

### Configuration ergonomics — 4 pts

Defaults must be secure. Insecure options require explicit opt-in.
Misconfiguration must be caught at startup with a clear, actionable error
message — not discovered at runtime under load. A store that silently degrades
without a startup error scores 0 on this criterion regardless of other scores.

### Middleware composability — 3 pts

Must integrate cleanly with auth, CSRF, rate-limiting, and other middleware
without order-of-operations constraints or hidden state coupling. Must expose
lifecycle hooks (session created, refreshed, rotated, destroyed, expired) that
are usable without modifying middleware internals.

### Diagnostics & logging — 2 pts

Lifecycle events must be emittable via a callback or event interface. Log levels
must be semantically consistent: warnings for recoverable/non-critical events,
errors for data loss events. Debug logging must be opt-in. Session payloads must
never appear in logs at any level.

### Migration & versioning — 4 pts

Schema changes must not require mass logouts. The middleware must support
graceful fallback for session documents written by a previous version. A
migration path (version field, schema coercion on read, or explicit migration
helper) must exist and be documented. Breaking changes without a migration path
score 0.

---

## Domain 5 — Documentation & Verification (not scored separately)

Documentation quality is assessed within each domain criterion. A claim in any
domain scores no higher than 2 if it lacks a corresponding test that exercises
the claimed behavior. Specifically:

- Concurrency safety: requires a deterministic conflict simulation test
- Crash resilience: requires a test that verifies recovery after a simulated
  crash or mid-write failure
- Flash lifecycle: requires a test across the redirect boundary
- Store failure modes: requires a test with a mock store that throws on get and
  set independently

"The code exists" is not verification. The test must demonstrate the behavior.

---

## Rating bands

| Score    | Rating                   | Meaning                                                                                                                                                              | Recommendation                                                                                    |
| -------- | ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| 0 – 49   | **Failure**              | One or more critical security flaws, persistent data loss, or unsafe defaults that expose users to exploitation.                                                     | Do not use. Report issues upstream. Replace entirely.                                             |
| 50 – 69  | **Sub-standard**         | Meets minimum requirements in most areas but has significant gaps in correctness, crash resilience, or security defaults.                                            | Low-risk internal tools only. Not suitable for authenticated user data or production deployments. |
| 70 – 84  | **Acceptable**           | Secure, correct under normal conditions, and reasonably performant. Known gaps are documented and mitigable at the application layer.                                | Suitable for production with documented caveats. Monitor known limitations actively.              |
| 85 – 100 | **Exceeds expectations** | Strong security posture, verified concurrency model, crash-resilient, pluggable, typed, well-documented, with tested edge cases and honest limitation documentation. | Recommended for all production use cases including high-traffic and regulated environments.       |

---

## Automatic failure conditions

Any of the following results in a **Failure** rating regardless of overall
score:

- Session IDs with fewer than 128 bits of cryptographic entropy
- No server-side invalidation on logout
- Session ID not regenerated after authentication (fixation vulnerability)
- Session payload stored or logged in plaintext in an accessible location
- No server-side absolute session expiry
- Last-write-wins concurrency with no conflict detection on a store that
  supports atomic operations
- A claimed behavior with no test coverage that exercises it

---

## Scoring worksheet

| Criterion                | Domain      | Weight  | Score (0–4) | Weighted pts |
| ------------------------ | ----------- | ------- | ----------- | ------------ |
| Session ID generation    | Security    | 10      |             |              |
| Transport security       | Security    | 9       |             |              |
| Session invalidation     | Security    | 9       |             |              |
| Fixation protection      | Security    | 7       |             |              |
| Concurrency safety       | Correctness | 8       |             |              |
| Crash resilience         | Correctness | 10      |             |              |
| Persistence correctness  | Correctness | 7       |             |              |
| Store I/O efficiency     | Performance | 9       |             |              |
| Store pluggability       | Performance | 9       |             |              |
| Flash / one-time data    | DX          | 4       |             |              |
| Ease of use              | DX          | 4       |             |              |
| Typed session data       | DX          | 4       |             |              |
| Configuration ergonomics | DX          | 4       |             |              |
| Middleware composability | DX          | 3       |             |              |
| Diagnostics & logging    | DX          | 2       |             |              |
| Migration & versioning   | DX          | 4       |             |              |
| **Total**                |             | **100** |             |              |

> **Weighted pts formula:** `(score / 4) × weight`, rounded to nearest integer.

---

## Evaluator notes

Scores must reference specific implementation evidence — file, function, or test
name. A domain score without cited evidence is invalid. The following assertions
require independent verification and cannot be self-reported:

- Any security claim
- Concurrency model and conflict resolution path
- Crash recovery behavior
- Test coverage for failure modes

A package that scores 85+ but has undocumented limitations scores no higher than
**Acceptable** until the limitations are documented. Honest documentation of
known gaps is a prerequisite for **Exceeds expectations**, not a deduction from
it.
