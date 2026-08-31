locals {
  name_prefix = "sightforge"
  env_suffix  = var.environment

  d1_name    = "${local.name_prefix}-d1-${local.env_suffix}"
  media_name = "${local.name_prefix}-media-${local.env_suffix}"
  queue_name = "${local.name_prefix}-jobs-queue-${local.env_suffix}"

  workers = {
    web       = "${local.name_prefix}-web-${local.env_suffix}"
    api_auth  = "${local.name_prefix}-api-auth-${local.env_suffix}"
    api_jobs  = "${local.name_prefix}-api-jobs-${local.env_suffix}"
    events    = "${local.name_prefix}-events-${local.env_suffix}"
    scheduler = "${local.name_prefix}-scheduler-${local.env_suffix}"
  }
}

# 1. Cloudflare D1 Database (R3, R79)
resource "cloudflare_d1_database" "database" {
  account_id = var.cloudflare_account_id
  name       = local.d1_name
}

# 2. Cloudflare R2 Media Storage Bucket (R3, R79)
resource "cloudflare_r2_bucket" "media" {
  account_id = var.cloudflare_account_id
  name       = local.media_name
  location   = "APAC"
}

# R2 CORS Policy: Allows frontend PUT uploads and GET/HEAD reads with exposed ETag (R79)
resource "cloudflare_r2_bucket_cors" "media_cors" {
  account_id  = var.cloudflare_account_id
  bucket_name = cloudflare_r2_bucket.media.name

  rules = [
    {
      allowed_origins = var.cors_allowed_origins
      allowed_methods = ["GET", "HEAD", "PUT"]
      allowed_headers = ["*"]
      expose_headers  = ["ETag", "Content-Length", "Content-Type"]
      max_age_seconds = 86400
    }
  ]
}

# R2 Lifecycle Rules: 1-day multipart upload abort and 30-day storage backstop (R24)
resource "cloudflare_r2_bucket_lifecycle" "media_lifecycle" {
  account_id  = var.cloudflare_account_id
  bucket_name = cloudflare_r2_bucket.media.name

  rules = [
    {
      id                                     = "abort-incomplete-multipart-uploads"
      enabled                                = true
      abort_incomplete_multipart_upload_days = var.media_lifecycle_multipart_abort_days
    },
    {
      id          = "expire-stale-media-backstop"
      enabled     = true
      expire_days = var.media_lifecycle_stale_expiry_days
    }
  ]
}

# 3. Cloudflare Queue for asynchronous CV job execution (R3, R79)
resource "cloudflare_queue" "jobs_queue" {
  account_id = var.cloudflare_account_id
  name       = local.queue_name
}

# 4. Five Worker Shells (web, api-auth, api-jobs, events, scheduler) (R3, KTD7, R79)
module "worker_web" {
  source     = "../../modules/worker"
  account_id = var.cloudflare_account_id
  name       = local.workers.web
  tags       = ["sightforge", "frontend", local.env_suffix]
}

module "worker_api_auth" {
  source     = "../../modules/worker"
  account_id = var.cloudflare_account_id
  name       = local.workers.api_auth
  tags       = ["sightforge", "api", "auth", local.env_suffix]
}

module "worker_api_jobs" {
  source     = "../../modules/worker"
  account_id = var.cloudflare_account_id
  name       = local.workers.api_jobs
  tags       = ["sightforge", "api", "jobs", local.env_suffix]
}

module "worker_events" {
  source     = "../../modules/worker"
  account_id = var.cloudflare_account_id
  name       = local.workers.events
  tags       = ["sightforge", "events", "queue-consumer", local.env_suffix]
}

module "worker_scheduler" {
  source     = "../../modules/worker"
  account_id = var.cloudflare_account_id
  name       = local.workers.scheduler
  tags       = ["sightforge", "scheduler", "cron", local.env_suffix]
}

# 5. Scheduled Cron Triggers for Scheduler Worker (R79)
resource "cloudflare_workers_cron_trigger" "scheduler_cron" {
  account_id  = var.cloudflare_account_id
  script_name = module.worker_scheduler.name
  schedules = [
    "*/15 * * * *", # Telemetry & quota monitor
    "0 0 * * *"     # Daily retention & idempotency key cleanup
  ]
}
