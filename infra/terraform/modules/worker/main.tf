resource "cloudflare_workers_script" "this" {
  account_id          = var.account_id
  script_name         = var.name
  content             = "export default { fetch() { return new Response('SightForge placeholder', { status: 200 }); } };"
  main_module         = "index.js"
  compatibility_date  = var.compatibility_date
  compatibility_flags = var.compatibility_flags

  lifecycle {
    ignore_changes = [
      content,
      main_module
    ]
  }
}
