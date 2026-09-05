variable "account_id" {
  description = "The Cloudflare Account ID"
  type        = string
}

variable "name" {
  description = "The name of the Worker script"
  type        = string
}

variable "compatibility_date" {
  description = "Cloudflare Workers runtime compatibility date"
  type        = string
  default     = "2026-08-29"
}

variable "compatibility_flags" {
  description = "Cloudflare Workers runtime compatibility flags"
  type        = list(string)
  default     = ["nodejs_compat"]
}
