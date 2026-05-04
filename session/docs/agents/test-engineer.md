# Test Engineering Strategy: Fresh Session

This document outlines the testing philosophy and high-level strategy for the
`@innovatedev/fresh-session` project. It serves as a guide for both human
engineers and AI agents to ensure that the test suite is not just "passing," but
**adequate, necessary, and useful**.

---

## 1. Test Philosophy

Our testing approach is built on three core pillars: **Invariants**,
**Resilience**, and **Integrity**.

### A. Invariants (What MUST be true)

We don't just test "if it works." We test that certain properties are _never_
violated:

- **Security Invariant**: Session IDs must have at least 128 bits of entropy and
  never be stored in the value payload.
- **Consistency Invariant**: A write-after-read must fail if the underlying
  version has changed (Optimistic Concurrency Control).
- **Persistence Invariant**: If a `set` operation returns successfully, the data
  MUST be retrievable in the next `get` call (Read-your-writes consistency).

### B. Resilience (The Unhappy Path)

Standard unit tests often focus on the "Happy Path." A test engineer in this
project focuses on:

- **Storage Failures**: What happens when Deno KV is temporarily unavailable?
- **Oversized Payloads**: What happens when session data exceeds 64KB?
- **Corrupt Data**: How do we handle legacy or malformed JSON in the store?

### C. Integrity (The "Agent" Factor)

In a multi-agent development environment, tests can become "hollow"—passing
because they mock the very logic they are supposed to verify.

- **Prefer Integration over Mocks**: Use `:memory:` KV instead of mocking the
  `Storage` interface whenever possible.
- **Negative Testing**: Assert what _should not_ happen (e.g., "should not write
  to KV if no data changed").

---

## 2. High-Level Ideas to Cover

Any new feature or refactor must be evaluated against these domains:

### Concurrency & Consistency

- **Race Conditions**: Parallel requests for the same session ID.
- **Atomic Reliability**: Verification that multi-step operations (like Kvdex
  index updates) are atomic or self-healing (WAL).
- **WAL Recovery**: Simulated crash recovery during the "window of
  vulnerability" between primary write and index sync.

### Security & Lifecycle

- **Absolute vs. Idle Expiry**: Ensuring sessions die when they are supposed to,
  regardless of activity.
- **Session Rotation**: Verification that `login()`/`logout()` triggers a full
  ID replacement to prevent session fixation.
- **Cookie Attributes**: Verification that headers include `HttpOnly`, `Secure`,
  and `SameSite=Lax`.

### Schema Evolution & Migrations

- **Backward Compatibility**: Verification that v0.6.0+ can handle (or safely
  invalidate) v0.5.0 sessions without crashing.
- **Field Consistency**: Ensuring that when new system fields (like `__v` or
  `lastSeenAt`) are added, existing sessions are either migrated or gracefully
  replaced.
- **Migration Edge Cases**: Testing migrations with null, undefined, or partial
  data in the store.

### DX & Code Generation (The Init Script)

- **Patch Integrity**: Ensuring regex-based patching of `utils.ts` and `main.ts`
  doesn't break existing code.
- **Type Inference**: Ensuring the _generated_ code in a fresh project has 100%
  type safety without `any`.
- **Boilerplate Preservation**: Ensuring we don't overwrite user changes in
  existing files during re-init.

---

## 3. Evaluating Test Adequacy

How do we know if our tests are "where they need to be"?

### 1. Is it Adequate? (Depth)

- **Bad**: Testing `store.set()` with a small string.
- **Good**: Testing `store.set()` with a 63.9KB payload, and then a 65KB payload
  (expecting failure).
- **Good**: Testing `store.get()` after manually corrupting the KV record via
  `Deno.openKv()`.

### 2. Is it Necessary? (Breadth)

- **Question**: Are we testing the library, or are we testing the underlying
  dependency (e.g., Deno KV)?
- **Rule**: If a test can be written using only the public API, it is likely a
  requirement. If it requires accessing private members or heavy mocking, it
  might be testing implementation details.

### 3. Is it Useful? (Debuggability)

- **Assertion Messages**: Every `expect` should have a clear intent.
- **Deterministic**: Tests that rely on `setTimeout` should be avoided in favor
  of "time-warping" or signal-based waiting.

---

## 4. Agent-Specific Guidelines

When instructing an agent to write tests:

1. **Demand Negative Assertions**: "Write a test that proves the session IS NOT
   updated if only `lastSeenAt` changed within the 1-minute buffer."
2. **Require "Zero-Any" Tests**: Tests should use the project's types. If an
   agent uses `any`, it often hides a regression in type inference.
3. **Simulate the Environment**: For the `init` script, the agent MUST perform
   the E2E flow: create a temp project, run init, and run `deno check` on the
   result.

---

## 5. Way to Evaluate Current Coverage

To evaluate if the current suite is adequate, ask:

1. "If I delete the Write-Ahead Log (WAL) logic, does a test fail?"
2. "If I change the session ID length to 8 characters, does a security test
   fail?"
3. "If I make the middleware write to KV on every request (ignoring the 1-minute
   buffer), does a performance test fail?"

**If the answer is 'No', the test suite is inadequate.**
