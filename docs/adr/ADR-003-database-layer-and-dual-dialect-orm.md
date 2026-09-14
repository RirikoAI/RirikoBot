# ADR-003: Database Layer and Dual-Dialect ORM

## Status
Accepted

## Context
Ririko 1.4.0 used TypeORM with better-sqlite3. While functional for small bots, TypeORM suffered from poor type inference, complex migration rollback issues, heavy reflection metadata, and weak support for multi-database dialect abstraction between cloud PostgreSQL and local SQLite.

## Decision
1. **ORM**: Adopt **Drizzle ORM** across all data operations.
2. **Dual-Dialect Strategy**:
   - **PostgreSQL** (`postgres` driver / `drizzle-orm/node-postgres`) for production cloud deployments requiring high concurrency and connection pooling.
   - **SQLite** (`better-sqlite3` driver / `drizzle-orm/better-sqlite3`) for local development, CI testing, and lightweight self-hosted instances.
3. **Schema Separation**: Maintain dual schema definitions sharing common TypeScript interfaces in `packages/database`, allowing repositories to execute dialect-agnostic business logic.
4. **ACID Transactions**: Enforce database transactions for all financial operations, inventory transfers, and card trading.

## Consequences
### Positive
- Zero runtime overhead and blazing-fast query execution.
- 100% type-safe queries and relations without relying on experimental decorators.
- Effortless local development without requiring local Docker PostgreSQL containers, while retaining full cloud PostgreSQL capability in production.

### Negative
- Schema alterations require maintaining parallel table definitions or using shared column builders across PostgreSQL and SQLite dialects.
