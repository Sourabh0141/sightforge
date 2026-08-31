import { relations } from "drizzle-orm";
import {
  index,
  integer,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

export const schemaVersion = "1.0.0";

export const VISION_TASKS = [
  "detection",
  "instance-segmentation",
  "pose",
  "obb",
  "classification",
  "semantic-segmentation",
  "depth",
] as const;
export type VisionTask = (typeof VISION_TASKS)[number];

export const PROCESSING_MODES = ["per-frame", "tracking"] as const;
export type ProcessingMode = (typeof PROCESSING_MODES)[number];

export const MEDIA_TYPES = ["image", "video"] as const;
export type MediaType = (typeof MEDIA_TYPES)[number];

export const JOB_STATUSES = [
  "created",
  "uploading",
  "queued",
  "processing",
  "completed",
  "failed",
  "cancelled",
] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

// ==========================================
// 1. Users Table
// ==========================================
export const users = sqliteTable(
  "users",
  {
    id: text("id").primaryKey(), // UUID v4
    email: text("email").notNull(), // Canonicalized email
    clientSalt: text("client_salt").notNull(), // Salt for client Argon2id derivation
    argon2MemoryKib: integer("argon2_memory_kib").notNull(), // e.g. 19456
    argon2Iterations: integer("argon2_iterations").notNull(), // e.g. 2
    argon2Parallelism: integer("argon2_parallelism").notNull(), // e.g. 1
    argon2Version: text("argon2_version").notNull(), // e.g. "0x13"
    serverSalt: text("server_salt").notNull(), // Random salt for server-side HMAC fast hash
    passwordHash: text("password_hash").notNull(), // Salted fast hash
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [uniqueIndex("users_email_idx").on(table.email)],
);

// ==========================================
// 2. Refresh Tokens Table (RFC 9700 Rotation & Revocation)
// ==========================================
export const refreshTokens = sqliteTable(
  "refresh_tokens",
  {
    id: text("id").primaryKey(), // UUID v4
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    hashedToken: text("hashed_token").notNull(), // SHA-256 hash of refresh token
    familyId: text("family_id").notNull(), // UUID for token family
    isConsumed: integer("is_consumed", { mode: "boolean" })
      .notNull()
      .default(false),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    familyExpiresAt: integer("family_expires_at", {
      mode: "timestamp_ms",
    }).notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [
    uniqueIndex("refresh_tokens_hashed_token_idx").on(table.hashedToken),
    index("refresh_tokens_family_id_idx").on(table.familyId),
    index("refresh_tokens_user_id_idx").on(table.userId),
    index("refresh_tokens_expires_at_idx").on(table.expiresAt),
  ],
);

// ==========================================
// 3. Jobs Table
// ==========================================
export const jobs = sqliteTable(
  "jobs",
  {
    id: text("id").primaryKey(), // UUID v4
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    task: text("task", { enum: VISION_TASKS }).notNull(),
    modelVariant: text("model_variant").notNull(), // e.g. "yolo26n", "yolo26s"
    mode: text("mode", { enum: PROCESSING_MODES }).notNull(),
    mediaType: text("media_type", { enum: MEDIA_TYPES }).notNull(),
    status: text("status", { enum: JOB_STATUSES }).notNull().default("created"),
    originalFilename: text("original_filename"), // Sanitized display metadata
    mediaKey: text("media_key"), // R2 key: users/<uid>/media/<jid>.<ext>
    mediaEtag: text("media_etag"), // Pinned ETag from post-upload validation
    resultKey: text("result_key"), // R2 key: users/<uid>/results/<jid>.json
    denseArtifactKey: text("dense_artifact_key"), // R2 key for packed 8-bit/16-bit PNG artifact
    errorCode: text("error_code"), // Standardized reason enum
    errorMessage: text("error_message"), // Safe, user-actionable message
    confidenceThreshold: real("confidence_threshold"),
    sourceFps: real("source_fps"),
    sampledFps: real("sampled_fps"),
    framesTotal: integer("frames_total"),
    framesCompleted: integer("frames_completed"),
    durationMs: real("duration_ms"),
    inferenceDurationMs: real("inference_duration_ms"),
    coldStartDurationMs: real("cold_start_duration_ms"),
    correlationId: text("correlation_id").notNull(), // Trace ID across CF & Modal
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [
    index("jobs_user_id_created_at_idx").on(table.userId, table.createdAt),
    index("jobs_status_created_at_idx").on(table.status, table.createdAt),
    index("jobs_correlation_id_idx").on(table.correlationId),
  ],
);

// ==========================================
// 4. Idempotency Keys Table
// ==========================================
export const idempotencyKeys = sqliteTable(
  "idempotency_keys",
  {
    id: text("id").primaryKey(), // UUID v4
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    key: text("key").notNull(), // Client-supplied Idempotency-Key
    requestFingerprint: text("request_fingerprint").notNull(), // SHA-256 of canonical request
    responseStatus: integer("response_status"), // Null while in flight
    responseHeaders: text("response_headers"), // JSON string
    responseBody: text("response_body"), // JSON string
    lockedUntil: integer("locked_until", { mode: "timestamp_ms" }).notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [
    uniqueIndex("idempotency_user_key_idx").on(table.userId, table.key),
    index("idempotency_locked_until_idx").on(table.lockedUntil),
  ],
);

// ==========================================
// Relations
// ==========================================
export const usersRelations = relations(users, ({ many }) => ({
  refreshTokens: many(refreshTokens),
  jobs: many(jobs),
  idempotencyKeys: many(idempotencyKeys),
}));

export const refreshTokensRelations = relations(refreshTokens, ({ one }) => ({
  user: one(users, {
    fields: [refreshTokens.userId],
    references: [users.id],
  }),
}));

export const jobsRelations = relations(jobs, ({ one }) => ({
  user: one(users, {
    fields: [jobs.userId],
    references: [users.id],
  }),
}));

export const idempotencyKeysRelations = relations(
  idempotencyKeys,
  ({ one }) => ({
    user: one(users, {
      fields: [idempotencyKeys.userId],
      references: [users.id],
    }),
  }),
);

// ==========================================
// Inferred Types
// ==========================================
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

export type RefreshToken = typeof refreshTokens.$inferSelect;
export type NewRefreshToken = typeof refreshTokens.$inferInsert;

export type Job = typeof jobs.$inferSelect;
export type NewJob = typeof jobs.$inferInsert;

export type IdempotencyKey = typeof idempotencyKeys.$inferSelect;
export type NewIdempotencyKey = typeof idempotencyKeys.$inferInsert;
