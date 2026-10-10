export const BREAKPOINT: string;
export const CONTRACT_MARKER: string;
export const MIGRATIONS_ROOT: string;
export const DIALECTS: ReadonlyArray<{
  dir: 'sqlite' | 'pg';
  exportName: string;
  label: string;
}>;

export interface MigrationFile {
  id: string;
  statements: string[];
  checksum: string;
  contract: boolean;
}

export function isContract(text: string): boolean;
export function readMigrations(dialectDir: string, root?: string): MigrationFile[];
export function renderMigrationsModule(
  label: string,
  exportName: string,
  migrations: readonly MigrationFile[],
): string;
