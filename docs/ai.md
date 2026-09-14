# AI subsystem design — pending implementation
Legacy source behavior and unfinished post-reply music code are recorded in the inventory. The new foundation does not register AI commands or providers.

Define ChatModelProvider before implementing Gemini, OpenAI-compatible and Ollama adapters. Dedicated-channel mode must require explicit guild opt-in. Persist conversation identity as guild/channel/user; test cross-user, cross-guild and cross-channel isolation. Store user identity/preferences separately from confidential credentials and system safety instructions. Guild personality text is untrusted configuration, not authority.

Define tools with strict schemas and application permission checks; tool calls cannot provide their own trusted actor or arbitrary HTTP/shell/SQL/filesystem execution. Clock/timezone comes from an explicit time tool. Music/profile/balance/reminder tools call the same services as commands. Bound rounds, output size, retries, timeouts, memory retention and cost. Implement provider fallback only when a real configured adapter exists.

