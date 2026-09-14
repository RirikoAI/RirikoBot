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
| Drizzle Kit | 0.31.10 (candidate; not installed) | 2026-03-17 | Reviewed migration generation; the current migrator uses checked-in SQL, not Kit. [Publisher metadata](https://registry.npmjs.org/drizzle-kit). |
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

## Installed boundary and dependency ownership

Read `package.json`, each workspace manifest and `pnpm-lock.yaml` together. A version in this evaluation table is not an installation instruction. The current repository has five application/package workspaces plus the root tooling project:

| Owner | Direct runtime dependencies | Why the boundary matters |
|---|---|---|
| `packages/core` | Zod, Pino | Domain contracts and configuration must remain usable without a Discord client, database driver or web framework. |
| `packages/database` | Core, Drizzle ORM, Postgres.js, better-sqlite3 | Both drivers are currently installed; choosing SQLite does not create a SQLite-only distribution. Native dependency installation remains a deployment concern. |
| `packages/discord` | Core | Transport-neutral command metadata/dispatch does not instantiate discord.js. |
| `apps/bot` | Core, database, discord package, discord.js | Owns the Gateway and REST library at the composition boundary. |
| `apps/cli` | Core, database, discord package, discord.js | Needs REST for explicit command synchronization; local database commands still load application dependencies. |
| Root development | TypeScript, ESLint and plugins, Vitest, tsx, declaration packages | Tool versions affect reproducibility but are not evidence that a provider or dashboard exists. |

There is no `apps/web`, audio SDK, canvas dependency, AI SDK or durable queue dependency in this installed graph. Adding one requires a groomed implementation scope, its relevant ADR and lockfile review. Avoid a catch-all services package that makes every process load every optional native/provider dependency.

The package exports use a development condition for `src/index.ts`, a types entry and a default compiled `dist/index.js` entry. Development uses `--conditions=development --import tsx`; production uses compiled JavaScript. A successful development launch alone does not verify that production exports resolve. Check both execution modes after changing package entrypoints. Export declarations define the supported import surface; they are not a security boundary. See [Node package entrypoints](https://nodejs.org/api/packages.html#package-entry-points).

## Compatibility and acceptance matrix

These are required evaluation cases, not a claim of completed cross-platform certification. Record the actual OS, architecture, runtime patch and lockfile digest with each result.

| Change | Minimum experiment | Reject or investigate when |
|---|---|---|
| Node patch/major | Frozen install, native SQLite load, compiled CLI smoke, unit and database suites | ABI/prebuilt artifact failure, new engine warnings, signal/shutdown change or platform-specific crash |
| TypeScript/parser pair | Check parser peer range, strict typecheck, project build, type-aware lint | Unsupported parser range even when one local compile happens to pass |
| pnpm major | Read that major's migration notes, frozen install in clean disposable checkout, compare lockfile and lifecycle behavior | Silent lockfile re-resolution, changed script approval defaults or non-reproducible optional dependencies |
| Drizzle/driver pair | Both schema builds, SQLite and PostgreSQL repository conformance, migration checksum/refusal tests | Dialect-specific numeric conversion, audit/CAS atomicity regression or changed transaction semantics |
| discord.js | Compile application adapters; replay interaction and message fixtures; authorized test-guild smoke later | REST payload incompatibility, intent changes, acknowledgement regression or lost permission checks |
| Canvas/audio candidate | Linux deployment target and Windows developer target; fonts/codecs, cancellation and memory-pressure fixture | Missing binary, undeclared system dependency, unbounded work on the bot event loop or inconsistent output |
| Dashboard candidate | Server build and browser tests, session/CSRF/authorization checks, shared schema compatibility | Server secrets in client output, stale permission acceptance or framework-only validation |
| Provider SDK candidate | Contract fixtures plus authorized live capability probe | SDK hides retry/cost behavior, incompatible response schema or undocumented fallback to another model/account |

The recorded local runtime is Node 24.13.1; the selected deployment patch is 24.19.0. Do not collapse these into one environment result. PostgreSQL server 18.6 and `postgres` 3.4.9 are separate products. SQLite driver package version also does not establish the embedded SQLite engine version; capture it from the tested connection when evaluating SQL capabilities.

## Alternatives and conditions for reopening decisions

Evaluate an alternative against the same workload, fixtures and budget as the incumbent. Avoid claims such as zero overhead, guaranteed uptime or a fixed speedup without retained measurements.

| Decision | Alternative retained for comparison | Cost accepted / reason to revisit |
|---|---|---|
| Explicit TypeScript composition | NestJS or another framework | We own lifecycle wiring and dependency boundaries. Revisit if repeated wiring defects demonstrably outweigh framework adoption/migration cost. |
| Drizzle and explicit dialect repositories | Kysely, Prisma, TypeORM | We own dialect migrations and conformance. Revisit if a required query/migration cannot be made correct or maintenance cost exceeds a demonstrated alternative; do not generalize old library versions to current ones. |
| discord.js at application edge | Direct REST/Gateway or another maintained client | We accept the client dependency to avoid maintaining protocol machinery. Revisit with measured resource constraints and parity tests, not popularity alone. |
| Direct AI adapters | An orchestration framework | We own context budgeting, tool mediation and persistence. A framework is justified only if it preserves observable retries, permission checks and provider-specific capabilities. |
| Canvas candidate | Existing node-canvas, SVG renderer, browser renderer | Native packaging, fonts and memory need experiments. Prefer output fidelity and deployability over an unsupported throughput claim. |
| Discord Player versus Lavalink | Direct voice pipeline | Decision remains open. Compare reconnect/recovery, extractor access, queue ownership, operating cost and measured concurrent guild load. An external process creates another failure and upgrade boundary. |
| Next.js target | A client application with separate API | Server rendering and shared code do not remove auth duties. Revisit if hosting constraints conflict with the required server/session model. |
| Vitest | Existing Jest assertions adapted or retained in an isolated migration harness | ESM fit is the current rationale; behavioral coverage matters more than rewriting tests for stylistic uniformity. |

## Supply-chain review and controlled upgrades

The repository pins direct versions with `save-exact=true`, enables strict peers, and permits dependency builds only for `better-sqlite3` and `esbuild` in `pnpm-workspace.yaml`. Review why an added package needs an install script before extending that list. pnpm documents dependency script restrictions, but its current website targets a newer major: do not copy new settings into pinned pnpm 10 without version compatibility checks. [pnpm supply-chain guidance](https://pnpm.io/supply-chain-security).

For an upgrade, preserve the old commit/lockfile and record the reason: security fix, unsupported runtime, required capability or verified defect. Inspect direct and transitive version changes, engine/peer constraints, package provenance where available, license texts and install scripts. A signed origin or registry integrity hash does not certify application behavior or safety. Never paste registry tokens into evidence.

Run installation and checks in an isolated evaluation checkout with no production credentials. Retain the install log with secrets removed, exact platform identity, lockfile diff, build/test results and native artifact checks. Distinguish a network download failure from an incompatible package. If a security issue needs a post-cutoff version, document the exception and evaluate it; the historic cutoff is not a deployment safety waiver.

Promote the reviewed lockfile and manifests together. Rollback means restoring the previously tested application artifact and configuration only when data/schema compatibility permits it; a dependency downgrade cannot reverse data writes. Database migrations require their own restore/forward-repair decision in [migrations](migrations.md). An update bot or registry alert may propose a ticket but does not authorize publishing a new scope.

## Provider evaluation record and failure classification

Each future adapter needs a versioned, credential-free evaluation record before enablement:

```text
provider / API family / SDK and API version / evaluated timestamp
official capability and access documentation URLs
account tier and region (no account secrets), approved data classes
model/source ID, input/output limits, supported operations
timeout, concurrency and cost budget, retry and cancellation behavior
fixture IDs; authorized live probe ID and result, or explicitly not run
retention/attribution/license findings; unresolved access conditions
owner, review expiry trigger and rollback/disable procedure
```

Do not merge these distinct outcomes into `unhealthy`: unsupported capability, configuration missing, authentication rejected, permission/access denied, quota exhausted, rate limited, transient unavailable, malformed response, cancelled and outcome unknown. For a paid request whose response is lost, retrying can incur a second charge; preserve its request identity and reconcile before repeating. Cross-provider fallback changes recipients of user data and must follow explicit operator policy, not happen invisibly.

For music, test metadata lookup and playable resolution separately, including wrong-song matching and unavailable tracks. For image generation, record workflow/model identity, output validation, attribution and deletion behavior. For stream notifications, test duplicate events, reconnect gaps and ambiguous Discord sends. For chat, test streaming cancellation, tool schema validation and memory isolation. Those probes are defined in [adapters](adapters.md), [music](music.md), [AI](ai.md) and [testing](testing.md); listing a provider here does not pass them.
