# SightForge TFLint Configuration (Plan 5, Unit 4 / R88)

config {
  call_module_type = "local"
  force            = false
}

plugin "terraform" {
  enabled = true
  preset  = "recommended"
}
