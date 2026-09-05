variable "cloudflare_account_id" {
  description = "The dedicated Cloudflare Account ID (non-secret identifier)"
  type        = string
}

variable "cloudflare_api_token" {
  description = "Cloudflare API token scoped to the account (injected via environment variable TF_VAR_cloudflare_api_token)"
  type        = string
  sensitive   = true
  default     = null
}

variable "environment" {
  description = "The deployment environment suffix"
  type        = string
  default     = "prod"
}

variable "cors_allowed_origins" {
  description = "Allowed origins for media bucket CORS policy (PUT uploads and GET/HEAD reads)"
  type        = list(string)
  default = [
    "https://sightforge.app",
    "https://*.workers.dev",
    "http://localhost:3000",
    "http://127.0.0.1:3000"
  ]
}

variable "media_lifecycle_multipart_abort_days" {
  description = "Days after which incomplete multipart uploads are aborted"
  type        = number
  default     = 1
}

variable "media_lifecycle_stale_expiry_days" {
  description = "Conservative maximum age in days for media retention backstop"
  type        = number
  default     = 30
}
