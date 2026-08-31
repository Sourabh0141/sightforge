resource "cloudflare_workers_script" "this" {
  account_id          = var.account_id
  name                = var.name
  content             = "export default { fetch() { return new Response('SightForge placeholder', { status: 200 }); } };"
  compatibility_date  = var.compatibility_date
  compatibility_flags = var.compatibility_flags
  tags                = var.tags

  lifecycle {
    ignore_changes = [
      content,
      module,
      analytics_engine_binding,
      d1_database_binding,
      kv_namespace_binding,
      queue_binding,
      r2_bucket_binding,
      service_binding,
      secret_text_binding,
      plain_text_binding
    ]
  }
}
