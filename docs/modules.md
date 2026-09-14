# Module contracts
Current runtime module: core (essential; enabled). It supplies ping, prefix and help. Major requested systems remain pending in implementation-roadmap.md and must not appear as enabled until working implementations are registered.

ModuleDefinition in packages/core defines id, name, description, defaultEnabled and essential. CommandMetadata declares its owning module. SettingsService takes the implemented module list and applies defaults; the dispatcher denies commands from modules absent/disabled in guild settings. Each application must share the same module composition. Persistent flags do not themselves load feature code.

Future module/channel/user schemas must explicitly say what each layer may override. User settings cannot relax role/command/provider limits. Modules with durable work need stop/recovery policies when disabled: disable new actions, reconcile or safely cancel existing work, and retain data for re-enable. Add configuration tests and docs before exposing a dashboard toggle.

