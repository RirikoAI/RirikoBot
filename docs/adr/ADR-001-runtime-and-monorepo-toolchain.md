# ADR-001: Runtime and monorepo toolchain

## Status and decision scope

Accepted and implemented for the foundation. Reviewed 2026-09-14 against the requested 2026-08-14 technology cutoff. This decision describes the bot/CLI and three shared packages, not a completed platform or production deployment. Relevant requirements: BP-04, BP-05, BP-06, BP-55, BP-56, BP-67 and BP-68.

## Problem and forces

The audited 1.4.0 package uses NestJS 10, CommonJS output, npm and TypeScript with strict null/implicit-any checking disabled. New bot, CLI and eventual web consumers need one source of domain contracts, independently testable modules and explicit startup/cleanup. Carrying the legacy framework merely to preserve directory conventions would retain coupling without preserving user-visible behavior. Conversely, splitting every feature into a service would make local operation and atomic domain changes harder before a workload demonstrates the need.

Selection must satisfy the requested cutoff, installed library compatibility, native database support, production execution and offline developer tests. The source audit contains no measured startup/build comparison. Package-manager choice cannot honestly promise a specific speedup.

## Alternatives considered

| Option | Benefit | Cost / reason not selected |
|---|---|---|
| Keep NestJS/npm monolith and reorganize gradually | Smaller initial toolchain migration; retains familiar framework | Existing transport/service coupling and mutable handler patterns still need redesign; framework reuse is not required for command compatibility |
| Explicit Node modules with pnpm workspaces and ESM | Small composition roots, shared contracts, clear package dependencies | Requires maintaining exports, lockfile and build references; chosen |
| Separate network service for every domain | Independent deployment/scaling is possible | Adds distributed failure, auth and transaction boundaries before an operational need exists |
| Add a build orchestration/cache framework immediately | Potential benefit as workspace/task count grows | Five working workspaces are handled by TypeScript references; no measured bottleneck justifies another dependency |
| Adopt a newer runtime/compiler simply because released | Access to new language/runtime features | Compatibility and verified baseline matter more; changes require their own evidence |

## Selected baseline

Use Node **24 LTS**, package engine **>=24.13.1 <25**, with **24.19.0** recommended for the requested cutoff. Use **pnpm 10.34.5**, the committed lockfile and exact direct dependency versions. Use **TypeScript 6.0.3**: the recorded typescript-eslint 8.67.0 peer range is `<6.1.0`; TypeScript 7 was already stable at the cutoff but is outside that parser range. This is a compatibility decision, not a claim that 6 is the newest compiler. [Dependency release/peer evidence](../dependency-evaluation.md) owns verification and future updates.

Implemented workspaces: `apps/bot`, `apps/cli`, `packages/core`, `packages/database`, `packages/discord`. Planned web/provider/domain packages are created when they contain working implementation. Application composition is explicit; no new dependency-injection framework or mandatory broker/cache service is introduced.

## Resolution and build contract

Every package is ESM through `type: module`. Shared exports select source through `types`/`development` and built JavaScript through the default condition. Development scripts use `--conditions=development --import tsx`; production starts emitted `dist` JavaScript. Internal relative imports name `.js` so emitted Node modules resolve correctly. Conditional exports provide explicit entry selection; consumers should use public package names rather than internal paths. [Node package documentation](https://nodejs.org/api/packages.html#conditional-exports).

Root `tsconfig.json` references the five projects. Package configs are composite, emit declarations/source maps into their own `dist`, and reference upstream packages. `tsc -b` builds this graph. The separate `tsconfig.check.json` includes apps, packages, tools and tests without emission, because a successful production build alone does not typecheck excluded test files. These are distinct gates. [TypeScript project references](https://www.typescriptlang.org/docs/handbook/project-references.html).

`pnpm-workspace.yaml` discovers `apps/*` and `packages/*`; internal dependencies use `workspace:*`. That protocol requires local workspace resolution instead of silently selecting an unrelated registry package. Adding a folder alone is insufficient: add the manifest, exports, project reference, root reference and tests as applicable. [pnpm workspace protocol](https://pnpm.io/workspaces#workspace-protocol-workspace).

The current strict policy includes `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitOverride`, no fallthrough and unused symbol checks. Missing optional properties are not equivalent to supplied `undefined`; array/map lookup results must handle absence. `skipLibCheck` avoids declaration-library checking, so strict project settings do not establish correctness of every third-party type. Runtime schemas still validate configuration, DB rows and provider/transport input.

## Import and ownership rules

Applications depend on packages; core never depends on Discord.js, SQL drivers or Next.js. Database implements core repository contracts. The command package consumes core while the bot edge owns Discord rendering. Avoid cross-package relative imports and reverse imports from a library into an application. TypeScript references and exports support these rules, but no comprehensive automated architectural import checker is claimed.

For a new domain, prefer a small directory and named functions until a package boundary earns its cost. A provider adapter can use an SDK internally, but its public request/result cannot leak SDK classes into unrelated domains. A repository may vary by dialect; an interface for that variation is justified. A one-line pure calculation does not need an abstract base class, factory and container registration.

## Operational consequences

A source-mode test can pass while a production import fails because `dist` is missing or exports are wrong. Validate both paths. A forgotten workspace declaration can make a local editor succeed via incidental files while a clean clone fails. Frozen installation and a built CLI run expose different classes of fault than lint alone.

Native `better-sqlite3` must be available for the selected Node/OS/architecture. `pnpm-workspace.yaml` allows install builds only for `better-sqlite3` and `esbuild`; adding another lifecycle build dependency requires deliberate review. The lockfile pins resolution, not the contents or correctness of every external service. A functioning Windows development install does not prove the Linux production image works.

No measured CI speedup is claimed for pnpm storage or incremental builds. No Linux-only toolchain is mandated for local work; documented commands and paths should work from the repository root on supported hosts. Runtime updates must check native-driver behavior, exported production entry points and provider SDK compatibility before deployment.

## Verification and reversal criteria

| Change | Required evidence | Revisit if |
|---|---|---|
| Node patch/minor within range | Frozen install, native SQLite integration, strict check/build and built CLI smoke | Security fix or library support requires a different patch |
| Runtime major | All above plus production image and representative gateway/provider lifecycle tests | Supported baseline becomes unavailable or a measured requirement needs the new major |
| TypeScript/parser update | Peer compatibility, lint, whole-workspace typecheck, declaration/build resolution | Compiler feature or correctness issue cannot be addressed within baseline |
| Workspace/export changes | Source-mode and built consumer tests; no reverse/undeclared imports | Public package contract cannot support an actual consumer |
| New build/service infrastructure | Before/after workload measurements, failure and recovery plan | Existing build or process topology demonstrably misses an accepted requirement |

Do not change packages during documentation work to make an ADR appear current. Toolchain updates are scoped tickets preserving the prior lockfile/configuration in Git. Rollback means a reviewed forward change to a validated baseline, with database compatibility evaluated separately; it never means silently resetting someone else's work. See [development](../development.md), [testing](../testing.md) and [architecture](../architecture.md).
