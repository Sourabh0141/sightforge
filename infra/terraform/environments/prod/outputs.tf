output "d1_database_id" {
  description = "The ID of the provisioned D1 database"
  value       = cloudflare_d1_database.database.id
}

output "d1_database_name" {
  description = "The name of the provisioned D1 database"
  value       = cloudflare_d1_database.database.name
}

output "media_bucket_name" {
  description = "The name of the provisioned R2 media bucket"
  value       = cloudflare_r2_bucket.media.name
}

output "jobs_queue_id" {
  description = "The ID of the provisioned Cloudflare Queue"
  value       = cloudflare_queue.jobs_queue.id
}

output "jobs_queue_name" {
  description = "The name of the provisioned Cloudflare Queue"
  value       = cloudflare_queue.jobs_queue.name
}

output "worker_names" {
  description = "Map of all five provisioned Worker names"
  value = {
    web       = module.worker_web.name
    api_auth  = module.worker_api_auth.name
    api_jobs  = module.worker_api_jobs.name
    events    = module.worker_events.name
    scheduler = module.worker_scheduler.name
  }
}
