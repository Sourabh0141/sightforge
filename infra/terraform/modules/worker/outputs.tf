output "id" {
  description = "The ID of the Worker script"
  value       = cloudflare_workers_script.this.id
}

output "name" {
  description = "The name of the Worker script"
  value       = cloudflare_workers_script.this.script_name
}
