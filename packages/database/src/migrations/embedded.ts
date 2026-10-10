/**
 * One versioned schema migration, embedded in code by `pnpm -F @ririko/database
 * db:generate-migrations` from `migrations/{sqlite,pg}/NNNN_<slug>.sql` (docs/adr/ADR-015).
 */
export interface EmbeddedMigration {
  /** The file name without `.sql`, for example `0000_baseline`. Migrations apply in this order. */
  readonly id: string;
  /** The file split on drizzle's `--> statement-breakpoint` marker. */
  readonly statements: readonly string[];
  /** sha256 (hex) of the file bytes with CRLF normalised to LF. */
  readonly checksum: string;
  /** True when the first line is `-- ririko:contract`: the migration may drop or rename. */
  readonly contract: boolean;
}
