# ADR-001: Runtime and monorepo toolchain

## Status

Accepted and implemented for the foundation. Reviewed 2026-09-14 against the requested 2026-08-14 technology cutoff. This status does not certify the unfinished platform or production deployment.

## Problem

The audited legacy package uses NestJS 10, CommonJS output, npm, and TypeScript with strict null/implicit-any checking disabled. The new bot and CLI need shared contracts and independently testable packages; the dashboard and domain workspaces are future work. The legacy audit provides no measured startup/build performance comparison.

## Options considered

- Keep the legacy NestJS/npm application and incrementally reorganize it.
- Use a modular Node.js application with explicit composition, ESM and pnpm workspaces.
- Introduce separate services and a distributed build/queue stack immediately.

## Decision

Use Node.js **24 LTS**, supported engine range **>=24.13.1 <25**, with **24.19.0** as the recommended release in the requested cutoff baseline. Use native ESM, **pnpm 10.34.5**, a committed lockfile, and exact direct dependency versions.

Use **TypeScript 6.0.3**, strict checking, exact optional properties and unchecked-index checking. This is a compatibility choice: typescript-eslint 8.67.0 declares TypeScript `<6.1.0`; TypeScript 7 was already stable by the cutoff but is outside that parser peer range. Do not describe TypeScript 6 as the newest overall release.

Separate applications from shared packages. The implemented foundation contains `apps/bot`, `apps/cli`, `packages/core`, `packages/database` and `packages/discord`. Add further workspaces when working implementation requires them. Use explicit service construction rather than a new dependency-injection framework or microservice layer. Dependencies flow from applications to packages; core has no transport/database-driver dependency.

## Consequences

Strict boundaries and shared contracts make changes reviewable, but require maintaining exports, project references and build scripts. pnpm deduplication is a tooling property, not evidence of a measured CI speedup. Native dependencies still require validation on supported operating systems and containers. The cutoff records the design baseline; security fixes must be reviewed before deployment.

## Validation and evidence

Installation, lockfile integrity, lint, strict type checking, build and tests gate toolchain changes. See [dependency release/peer evidence](../dependency-evaluation.md), [architecture](../architecture.md), and [legacy inventory](../legacy-feature-inventory.md). Runtime-major upgrades require native-driver and provider compatibility checks.
