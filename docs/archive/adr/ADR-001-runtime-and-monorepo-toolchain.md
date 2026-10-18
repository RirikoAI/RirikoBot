# ADR-001: Runtime Environment and Monorepo Toolchain

## Status
Accepted

## Context
Ririko 1.4.0 was built as a single monolithic repository using NestJS 10, CommonJS / partial ESM transpilation, and npm. As the project expands to include a Discord bot, a Next.js web dashboard, a developer CLI, and shared domain libraries, the codebase requires an architecture that promotes modular isolation, shared type definitions, and rapid build times.

## Decision
1. **Runtime**: Adopt **Node.js 22+ LTS / 24 LTS** with native ESM (`"type": "module"`).
2. **Package Management**: Adopt **pnpm 10.x** with pnpm workspaces for fast, disk-efficient dependency deduplication.
3. **Language**: Standardize on **TypeScript 5.8+ / 6.x** in strict mode (`strict: true`, `noImplicitAny: true`, `exactOptionalPropertyTypes: true`).
4. **Monorepo Structure**: Separate concerns into `apps/` (`bot`, `web`, `cli`) and `packages/` (`core`, `database`, `discord`, `ai`, `music`, `graphics`, `services`).

## Consequences
### Positive
- Strict package boundaries prevent spaghetti code and cyclical imports.
- Shared domain types and Zod schemas are instantly available across both the bot and web dashboard without code duplication.
- pnpm's content-addressable storage significantly accelerates CI build and installation times.

### Negative
- Requires maintaining workspace configuration (`pnpm-workspace.yaml`).
- Developers must run builds through workspace filters or root orchestration scripts.
