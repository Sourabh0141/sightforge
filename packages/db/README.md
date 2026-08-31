# @sightforge/db

> D1 SQLite database schema, Drizzle ORM models, and versioned migrations for SightForge.

---

## Tables Overview

The database contains four core tables defined in [`src/schema.ts`](./src/schema.ts):

1. **`users`**: User identity and credentials. Stores canonicalized email, client-side Argon2id derivation salt & parameters (`memory_kib`, `iterations`, `parallelism`, `version`), server-side random salt, and fast password hash. Plaintext passwords never touch the server.
2. **`refresh_tokens`**: Rotating refresh tokens conforming to RFC 9700. Stores hashed tokens (`hashed_token`), `user_id` (cascading on account deletion), `family_id` (UUID for session lineage), `is_consumed` boolean, and absolute family expiry.
3. **`jobs`**: Computer vision job records. Tracks status across the 7 lifecycle states (`created`, `uploading`, `queued`, `processing`, `completed`, `failed`, `cancelled`), 7 vision tasks, mode (`per-frame` / `tracking`), R2 storage keys (`media_key`, `result_key`, `dense_artifact_key`), validation `media_etag`, progress counters, and timing telemetry. Result JSON payloads reside in R2, never in D1.
4. **`idempotency_keys`**: Atomic idempotency locks scoped by `(user_id, key)` unique constraint. Tracks request fingerprint, cached response status/headers/body for replay, and lease expiry (`locked_until`).

---

## D1 Transaction Model & Constraints (R26, KTD8)

### 1. `batch()` as the Sole Transaction Primitive

Cloudflare D1 runs on SQLite in a distributed edge environment and **does not support interactive transactions**. Statements such as `BEGIN TRANSACTION`, `COMMIT`, or `ROLLBACK` are rejected.

To execute atomic multi-statement operations, you must use **`d1.batch()`** (or Drizzle's **`db.batch()`**):

```typescript
// Example: Atomic state transition
await db.batch([
  db
    .update(jobs)
    .set({ status: "completed", durationMs: 120.5, updatedAt: Date.now() })
    .where(and(eq(jobs.id, jobId), eq(jobs.status, "processing"))),
]);
```

### 2. Guarded State Transitions (KTD8)

A D1 batch is an atomic sequence rather than a conditional control-flow structure. If a guard on the first statement fails (affecting 0 rows), subsequent statements in the batch will still execute unless they also include the guard predicate.

**Rule:** Every statement in a guarded transition batch must repeat the same state predicate (e.g. `WHERE id = ? AND status = 'processing'`), and the caller must verify the affected row count.

---

## Write Budget Considerations (R2)

Cloudflare D1's free-plan allocation allows **100,000 writes per day**.

- **Indexed Inserts:** An insert into a table with $N$ indexes costs $1 + N$ writes against the daily write budget (1 for the base row, plus 1 write per index entry).
- The index set in `@sightforge/db` is strictly minimal and scoped only to high-frequency lookup patterns (user job history, expiration sweeps, unique constraint enforcement).

---

## Migrations Workflow

Migrations are generated using Drizzle Kit and applied via Wrangler:

```bash
# Generate a new migration from schema changes
pnpm --filter @sightforge/db generate

# Apply migrations locally during development
pnpm wrangler d1 migrations apply sightforge-d1-prod --local

# Apply migrations to remote production database (executed during deployment sequence)
pnpm wrangler d1 migrations apply sightforge-d1-prod --remote
```
