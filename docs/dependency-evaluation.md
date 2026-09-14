# Dependency and provider evaluation

Research date: **2026-09-14**. Requested technology cutoff: **2026-08-14**, inclusive UTC. This is a release-selection record, not evidence that every proposed subsystem is implemented or production-tested.

## Evidence and selection method

The package rows below were read from public npm registry publisher metadata: stable major.minor.patch versions, publication timestamps before 2026-08-15T00:00:00Z, and engine/peer requirements. Prereleases were excluded. Node uses its official release record. Current September documentation may describe newer behavior than the cutoff; those observations are current research, not a historical snapshot.

Use exact direct dependency versions and commit the pnpm lockfile. Package existence does not establish compatibility: installation, strict type checking, linting, tests, database integration and native binary checks remain release gates. Review later security releases before production deployment; the cutoff does not justify ignoring fixes.

## Foundation selections

| Component | Selected version | Published UTC | Evidence and reason |
|---|---|---|---|
| Node.js | 24.19.0 | 2026-08-03 | Requested LTS line; [official release](https://nodejs.org/en/blog/release/v24.19.0). |
| TypeScript | 6.0.3 | 2026-04-16 | Latest 6.x stable; [publisher metadata](https://registry.npmjs.org/typescript). Compatibility exception below. |
| pnpm | 10.34.5 | 2026-07-10 | Latest stable 10.x before cutoff; [publisher metadata](https://registry.npmjs.org/pnpm). Workspaces and a single lockfile fit this repository. |
| discord.js | 14.27.0 | 2026-07-15 | Stable requested 14.x line; [publisher metadata](https://registry.npmjs.org/discord.js). |
| Zod | 4.4.3 | 2026-05-04 | Parse environment, command and external data; [publisher metadata](https://registry.npmjs.org/zod). |
| Pino | 10.3.1 | 2026-02-09 | Structured logging with explicit redaction; [publisher metadata](https://registry.npmjs.org/pino). |
| Drizzle ORM | 0.45.2 | 2026-03-27 | SQL-first data layer; [publisher metadata](https://registry.npmjs.org/drizzle-orm). Exclude 1.x prereleases. |
| Drizzle Kit | 0.31.10 | 2026-03-17 | Reviewed migration generation; [publisher metadata](https://registry.npmjs.org/drizzle-kit). |
| Postgres.js (postgres) | 3.4.9 | 2026-04-05 | PostgreSQL driver; [publisher metadata](https://registry.npmjs.org/postgres). Not the PostgreSQL server version. |
| better-sqlite3 | 13.0.3 | 2026-08-05 | SQLite driver, Node >=22; [publisher metadata](https://registry.npmjs.org/better-sqlite3). Native binaries require validation. |
| Vitest | 4.1.10 | 2026-07-06 | Unit/integration runner supporting Node 24; [publisher metadata](https://registry.npmjs.org/vitest). |
| ESLint | 10.8.1 | 2026-08-07 | Flat-config linting, supports Node >=24; [publisher metadata](https://registry.npmjs.org/eslint). |
| @eslint/js | 10.0.1 | 2026-02-06 | Recommended rules; [publisher metadata](https://registry.npmjs.org/@eslint/js). |
| typescript-eslint | 8.67.0 | 2026-08-10 | ESLint 10 compatible; [publisher metadata](https://registry.npmjs.org/typescript-eslint). |
| tsx | 4.23.12 | 2026-08-10 | Development/CLI execution, not type checking; [publisher metadata](https://registry.npmjs.org/tsx). |
| @types/node | 24.13.3 | 2026-07-08 | Runtime-major-aligned declarations; [publisher metadata](https://registry.npmjs.org/@types/node). |
| @types/better-sqlite3 | 9.6.0 | 2026-08-01 | Declaration package has independent versioning; [publisher metadata](https://registry.npmjs.org/@types/better-sqlite3). |

**TypeScript compatibility exception:** TypeScript 7.0.2 was stable by the cutoff (published 2026-07-08). TypeScript 6 is not the current overall stable release. However, typescript-eslint@8.67.0 and its parser declare TypeScript >=4.8.4 <6.1.0. Select 6.0.3 until the parser supports 7.x and compatibility checks pass. See the [official TypeScript 7 announcement](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/) and [exact peer requirements](https://registry.npmjs.org/typescript-eslint/8.67.0).

pnpm 10 is a deliberate major-line choice; the observed September stable tag is 12.4.1. Node 24.21.0, Zod 4.6.5 and Vitest 5.0.0 are also newer September observations, excluded from this August baseline.

## Architecture tradeoffs

**Modular TypeScript:** use explicit composition and narrow domain contracts. NestJS supports modular applications; this project avoids carrying a framework/container its new boundaries do not require. There is no measured startup-speed comparison.

**Drizzle:** choose explicit SQL schemas and queries, without claiming zero overhead or automatic portability. PostgreSQL and SQLite need separate schema/migration definitions and shared repository conformance tests. SQLite has different locking, integers, timestamps and transactions; its synchronous driver can block the event loop. Keep transactions short. Pair Postgres.js with `drizzle-orm/postgres-js`; `drizzle-orm/node-postgres` uses the separate `pg` driver. [Official driver guide](https://orm.drizzle.team/docs/get-started-postgresql).

**Databases:** PostgreSQL is the production target. The deployment definition selects server 18.6 (released 2026-08-13), independently of the driver; backup/restore and container integration checks still gate production use. SQLite serves development and smaller installations with explicit concurrency limits. See the [deployment guide](deployment.md) and [official server release](https://www.postgresql.org/docs/release/18.6/).

**Tests:** Vitest fits strict ESM and workspace testing. Preserve useful legacy assertions when porting. No unmeasured speed or memory claims are made.

**Rendering:** evaluate @napi-rs/canvas against existing images/fonts. Prebuilt artifacts may simplify installation on supported targets, but platform support, image quality and throughput require verification.

## Later subsystem candidates

These versions existed before the cutoff. They are researched candidates, not an assertion that packages are installed or providers connected.

| Package | Candidate | Published UTC | Source |
|---|---|---|---|
| @discordjs/voice | 0.19.2 | 2026-03-17 | [Metadata](https://registry.npmjs.org/@discordjs/voice); Node >=22.12.0. |
| discord-player | 7.2.0 | 2026-03-01 | [Metadata](https://registry.npmjs.org/discord-player). |
| @napi-rs/canvas | 1.0.6 | 2026-08-13 | [Metadata](https://registry.npmjs.org/@napi-rs/canvas). |
| next | 16.3.1 | 2026-08-13 | [Metadata](https://registry.npmjs.org/next); review later fixes before deployment. |
| react | 19.2.8 | 2026-07-21 | [Metadata](https://registry.npmjs.org/react). |
| tailwindcss | 4.3.3 | 2026-07-16 | [Metadata](https://registry.npmjs.org/tailwindcss). |
| @playwright/test | 1.62.1 | 2026-07-30 | [Metadata](https://registry.npmjs.org/@playwright/test). |
| @google/genai | 2.17.1 | 2026-08-13 | [Metadata](https://registry.npmjs.org/@google/genai). |
| openai | 7.4.0 | 2026-08-03 | [Metadata](https://registry.npmjs.org/openai). |

Next.js App Router is planned for the dashboard, with server-held OAuth credentials and shared validation. Authorization still runs on every protected server operation; a framework does not establish permission safety. [Next.js 16 release](https://nextjs.org/blog/next-16).

## Provider decisions and unverified capabilities

| Area | Decision/status | Requirements before enabling |
|---|---|---|
| Chat | Gemini, OpenAI, local Ollama and explicitly configured compatible endpoints are candidates. SDK releases are verified; account-specific models, quotas, prices and data policies are not. | Capability declarations for streaming/tools; available model IDs selected at configuration time; bounded timeouts, budgets, validation, cancellation and guild/user-scoped memory. |
| Music engine | Compare Discord Player 7.2.0 and Lavalink 4 behind one interface. Selection pending playback/reconnect tests. | Measure resource behavior; Lavalink adds a process/plugins to operate. No uptime guarantee. [Lavalink docs](https://lavalink.dev/). |
| Spotify | Metadata resolution is distinct from playable audio resolution. Its Discord Player extractor is documented as search-only. | Verify app access and quota mode; require an allowed playable matching source. A Spotify URI is not a downloadable stream. [Extractors](https://discord-player.js.org/docs/creating-a-music-bot/02_extractors_integration), [Spotify limits](https://developer.spotify.com/documentation/web-api/concepts/rate-limits). |
| YouTube, Deezer, SoundCloud music | Required targets, but availability/permissions are not proven by an interface. | Test each source with current provider terms and configured credentials. Explicitly report blocked, unsupported and quota-exhausted requests. |
| Open image option | Prefer operator-hosted ComfyUI. Requires a running backend, compatible model and adequate hardware. | Verify model licenses/workflow nodes and bound resources. Open software does not mean free compute. [System requirements](https://docs.comfy.org/installation/system_requirements). |
| Hosted image allocation | Hugging Face is optional experimentation, not evidence of a free production service. | Current pricing lists free-user monthly credit of **$0.10, subject to change**. Verify selected model availability and actual costs. [Pricing](https://huggingface.co/docs/inference-providers/en/pricing). |
| Paid images | Gemini, OpenAI and Replicate remain candidates; exact image models, prices, retention, quotas and editing capabilities are unverified. | Register verified capabilities only; enforce guild/user quotas, concurrency, retry limits and cancellation. Report unsupported parameters. |
| Twitch streams | Prefer EventSub with persistent deduplication and reconnect recovery. | Verify scopes/subscription limits and handle repeated deliveries. [WebSocket events](https://dev.twitch.tv/docs/eventsub/handling-websocket-events/). |
| YouTube streams | Data API resources with quota budgeting and caching. | Current quota page updated **2026-09-04**, after cutoff: operational guidance, not August evidence. Avoid assumed historic costs. [Quota guide](https://developers.google.com/youtube/v3/determine_quota_cost). |
| TikTok/Facebook streams | Extension points only; stable official general-purpose live watcher access was not verified here. | Research eligible APIs/access first. Mark unavailable configuration honestly; no fake successful health checks. |
| Anime/images/free-game feeds | Preserve audited features while evaluating Jikan, AniList, waifu.im and existing promotion feeds. | Verify limits, attribution, caching rights and image provenance before new ingestion. An endpoint is not proof of redistribution rights. |

Limits/pricing describe the research date. Account-specific tests need authorized credentials; none were used here. There are no promises of permanent free access, uptime or measured performance improvements.

## Gemini CLI project-agent format

Current [subagent documentation](https://geminicli.com/docs/core/subagents/) supports `.gemini/agents/*.md` YAML: required name/description; optional kind: local, tools, model, max_turns and timeout_mins. Omitted model inherits the session model. Agents are currently enabled by default. Stable CLI tag observed on 2026-09-14: **0.59.0**, published 2026-09-08. CLI configuration follows current development tooling, not a backdated August release.

Registered tools include `read_file`, `grep_search`, `glob`, `list_directory`, `replace`, `write_file` and `run_shell_command`. Previous client_view_file/client_edit_file/client_create_file/find_by_name/run_command names were invalid built-ins. Read-only auditors/reviewers receive search/read tools only and return findings for implementation. Allowlists are not filesystem sandboxes. [Tool reference](https://geminicli.com/docs/reference/tools/).

Project settings load GEMINI.md and AGENTS.md through `context.fileName`; modular context uses `@./docs/file.md` imports. Keep paths valid and imported files free of secrets. [Context/import guide](https://geminicli.com/docs/cli/gemini-md/), [configuration](https://geminicli.com/docs/reference/configuration/).

Validate JSON/frontmatter statically, then use `/agents`, `/tools` and `/memory show` in the installed CLI to check discovery. Static validation does not constitute an authenticated CLI smoke test. Do not suppress normal CLI approval policies or grant unrestricted shell tools to read-only audit agents.
