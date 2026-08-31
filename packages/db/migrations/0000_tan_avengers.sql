CREATE TABLE `idempotency_keys` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`key` text NOT NULL,
	`request_fingerprint` text NOT NULL,
	`response_status` integer,
	`response_headers` text,
	`response_body` text,
	`locked_until` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idempotency_user_key_idx` ON `idempotency_keys` (`user_id`,`key`);--> statement-breakpoint
CREATE INDEX `idempotency_locked_until_idx` ON `idempotency_keys` (`locked_until`);--> statement-breakpoint
CREATE TABLE `jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`task` text NOT NULL,
	`model_variant` text NOT NULL,
	`mode` text NOT NULL,
	`media_type` text NOT NULL,
	`status` text DEFAULT 'created' NOT NULL,
	`original_filename` text,
	`media_key` text,
	`media_etag` text,
	`result_key` text,
	`dense_artifact_key` text,
	`error_code` text,
	`error_message` text,
	`confidence_threshold` real,
	`source_fps` real,
	`sampled_fps` real,
	`frames_total` integer,
	`frames_completed` integer,
	`duration_ms` real,
	`inference_duration_ms` real,
	`cold_start_duration_ms` real,
	`correlation_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `jobs_user_id_created_at_idx` ON `jobs` (`user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `jobs_status_created_at_idx` ON `jobs` (`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `jobs_correlation_id_idx` ON `jobs` (`correlation_id`);--> statement-breakpoint
CREATE TABLE `refresh_tokens` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`hashed_token` text NOT NULL,
	`family_id` text NOT NULL,
	`is_consumed` integer DEFAULT false NOT NULL,
	`expires_at` integer NOT NULL,
	`family_expires_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `refresh_tokens_hashed_token_idx` ON `refresh_tokens` (`hashed_token`);--> statement-breakpoint
CREATE INDEX `refresh_tokens_family_id_idx` ON `refresh_tokens` (`family_id`);--> statement-breakpoint
CREATE INDEX `refresh_tokens_user_id_idx` ON `refresh_tokens` (`user_id`);--> statement-breakpoint
CREATE INDEX `refresh_tokens_expires_at_idx` ON `refresh_tokens` (`expires_at`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`client_salt` text NOT NULL,
	`argon2_memory_kib` integer NOT NULL,
	`argon2_iterations` integer NOT NULL,
	`argon2_parallelism` integer NOT NULL,
	`argon2_version` text NOT NULL,
	`server_salt` text NOT NULL,
	`password_hash` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_idx` ON `users` (`email`);