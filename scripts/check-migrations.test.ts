import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DIALECTS,
  readMigrations,
  renderMigrationsModule,
} from '../packages/database/scripts/migration-files.mjs';
import {
  checkEmbedded,
  checkSafety,
  checkSchemaInSync,
  formatProblem,
  lintMigrationSafety,
  main,
  maskSql,
  runChecks,
  type GenerateRunner,
} from './check-migrations';

const BASELINE = 'CREATE TABLE "things" (\n\t"id" text PRIMARY KEY NOT NULL\n);';

type Files = Partial<Record<'sqlite' | 'pg', Record<string, string>>>;

let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'ririko-check-migrations-'));
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

/** A stand-in for packages/database: SQL files, drizzle's journal and (optionally) the modules. */
function makePackage(files: Files, options: { embed?: boolean } = {}): string {
  for (const { dir, exportName, label } of DIALECTS) {
    const sql = files[dir] ?? { '0000_baseline.sql': BASELINE };
    const folder = join(root, 'migrations', dir);
    mkdirSync(join(folder, 'meta'), { recursive: true });
    for (const [name, text] of Object.entries(sql)) writeFileSync(join(folder, name), text);
    const tags = Object.keys(sql)
      .sort()
      .map((name) => ({ tag: name.replace(/\.sql$/, '') }));
    writeFileSync(join(folder, 'meta', '_journal.json'), JSON.stringify({ entries: tags }));
    if (options.embed !== false) {
      mkdirSync(join(root, 'src', 'migrations', 'generated'), { recursive: true });
      writeFileSync(
        join(root, 'src', 'migrations', 'generated', `${dir}.ts`),
        renderMigrationsModule(label, exportName, readMigrations(dir, join(root, 'migrations'))),
      );
    }
  }
  return root;
}

const migrations = () => join(root, 'migrations');
const generated = () => join(root, 'src', 'migrations', 'generated');

describe('maskSql', () => {
  it('blanks comments and keeps the offsets', () => {
    const sql = 'SELECT 1; -- DROP TABLE a\n/* DROP /* nested */ TABLE b */ SELECT 2;';
    const { code, masked } = maskSql(sql);
    expect(code).toHaveLength(sql.length);
    expect(masked).toHaveLength(sql.length);
    expect(masked).not.toMatch(/DROP|TABLE a|nested/);
    expect(masked.split('\n')).toHaveLength(2);
    expect(masked).toContain('SELECT 1;');
    expect(masked).toContain('SELECT 2;');
  });

  it('hides the inside of string literals and quoted identifiers, but keeps them in `code`', () => {
    const sql = `INSERT INTO "drop table" VALUES ('it''s a RENAME', \`x;y\`);`;
    const { code, masked } = maskSql(sql);
    expect(code).toBe(sql);
    expect(masked).toBe(`INSERT INTO "__________" VALUES ('______________', \`___\`);`);
    expect(masked).toHaveLength(sql.length);
  });

  it('hides dollar-quoted PostgreSQL strings', () => {
    const sql = 'DO $body$ BEGIN DROP TABLE a; END $body$; SELECT $$x;y$$;';
    const { masked } = maskSql(sql);
    expect(masked).toBe(
      'DO $body$' + '_'.repeat(' BEGIN DROP TABLE a; END '.length) + '$body$; SELECT $$___$$;',
    );
  });

  it('handles an unterminated string, identifier, dollar quote and comment', () => {
    for (const sql of ["SELECT 'open", 'SELECT "open', 'SELECT $x$ open', 'SELECT /* open']) {
      const { code, masked } = maskSql(sql);
      expect(code.length).toBe(sql.length);
      expect(masked).toHaveLength(sql.length);
    }
    expect(maskSql('SELECT -- last line, no newline').masked.trimEnd()).toBe('SELECT');
  });
});

describe('lintMigrationSafety', () => {
  const rules: Array<[string, string]> = [
    ['DROP TABLE', 'DROP TABLE "old";'],
    ['DROP TABLE', 'drop table if exists old;'],
    ['DROP COLUMN', 'ALTER TABLE "t" DROP COLUMN "c";'],
    ['RENAME', 'ALTER TABLE "t" RENAME TO "u";'],
    ['RENAME', 'ALTER TABLE "t" RENAME COLUMN "a" TO "b";'],
    ['ALTER COLUMN ... TYPE', 'ALTER TABLE "t" ALTER COLUMN "c" SET DATA TYPE bigint;'],
    ['ALTER COLUMN ... TYPE', 'ALTER TABLE t ALTER COLUMN c TYPE bigint;'],
    ['SET NOT NULL', 'ALTER TABLE "t" ALTER COLUMN "c" SET NOT NULL;'],
    ['SET NOT NULL', 'alter table t alter column c set\n  not null;'],
  ];

  it.each(rules)('flags %s: %s', (name, sql) => {
    const problems = lintMigrationSafety(
      'migrations/pg/0001_x.sql',
      `${BASELINE}\n--> statement-breakpoint\n${sql}\n`,
    );
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatchObject({ check: 'safety', file: 'migrations/pg/0001_x.sql' });
    expect(problems[0]!.message).toContain(name);
    expect(problems[0]!.message).toContain('-- ririko:contract');
    // The statement is printed on one line, without the neighbours.
    expect(problems[0]!.statement).toBe(sql.replace(/;$/, '').replaceAll(/\s+/g, ' '));
  });

  it('reports every offending statement of a file, not the safe ones', () => {
    const sql = [
      'CREATE TABLE "a" ("id" text);',
      '--> statement-breakpoint',
      'DROP TABLE "b";',
      '--> statement-breakpoint',
      'ALTER TABLE "a" ADD COLUMN "n" integer;',
      '--> statement-breakpoint',
      'ALTER TABLE "a" RENAME TO "c";',
    ].join('\n');
    const problems = lintMigrationSafety('f.sql', sql);
    expect(problems.map((problem) => problem.statement)).toEqual([
      'DROP TABLE "b"',
      'ALTER TABLE "a" RENAME TO "c"',
    ]);
  });

  it('ignores the keywords in comments, strings and identifiers', () => {
    const sql = [
      '-- DROP TABLE nothing, RENAME everything',
      'CREATE TABLE "drop table" ("rename" text, "dropped_at" integer, renamed integer);',
      "INSERT INTO t VALUES ('DROP COLUMN x; SET NOT NULL');",
      '/* ALTER TABLE t DROP COLUMN c */',
      'CREATE INDEX idx_rename ON t (renamed);',
    ].join('\n');
    expect(lintMigrationSafety('f.sql', sql)).toEqual([]);
  });

  it('skips a contract migration, with LF or CRLF line ends', () => {
    expect(lintMigrationSafety('f.sql', '-- ririko:contract\nDROP TABLE "x";\n')).toEqual([]);
    expect(lintMigrationSafety('f.sql', '-- ririko:contract\r\nDROP TABLE "x";\r\n')).toEqual([]);
  });

  it('requires the marker on the first line', () => {
    expect(lintMigrationSafety('f.sql', '\n-- ririko:contract\nDROP TABLE "x";')).toHaveLength(1);
    expect(
      lintMigrationSafety(
        'f.sql',
        'CREATE TABLE a (id text);\n-- ririko:contract\nDROP TABLE "x";',
      ),
    ).toHaveLength(1);
  });

  it('cuts a long statement to one line', () => {
    const columns = Array.from({ length: 80 }, (_, i) => `ADD COLUMN c${i} text`).join(', ');
    const [problem] = lintMigrationSafety('f.sql', `ALTER TABLE t RENAME TO u, ${columns};`);
    expect(problem!.statement!.length).toBeLessThanOrEqual(160);
    expect(problem!.statement!.endsWith('…')).toBe(true);
  });
});

describe('checkSafety', () => {
  it('lints every migration of both dialects and names the file', () => {
    makePackage({
      sqlite: {
        '0000_baseline.sql': BASELINE,
        '0001_drop.sql': 'DROP TABLE `things`;',
        '0002_contract.sql': '-- ririko:contract\nDROP TABLE `other`;',
      },
      pg: {
        '0000_baseline.sql': BASELINE,
        '0001_rename.sql': 'ALTER TABLE "things" RENAME TO "stuff";',
      },
    });
    const problems = checkSafety(migrations());
    expect(problems.map((problem) => problem.file)).toEqual([
      'migrations/sqlite/0001_drop.sql',
      'migrations/pg/0001_rename.sql',
    ]);
  });

  it('passes the migrations of this repository, baseline included', () => {
    const real = fileURLToPath(new URL('../packages/database/migrations', import.meta.url));
    expect(checkSafety(real)).toEqual([]);
  });

  it('finds nothing in a folder without migrations', () => {
    expect(checkSafety(join(root, 'nothing-here'))).toEqual([]);
  });
});

describe('checkEmbedded', () => {
  it('passes when the modules are what the embedder writes', () => {
    makePackage({});
    expect(checkEmbedded(migrations(), generated())).toEqual([]);
  });

  it('accepts a module with CRLF line ends', () => {
    makePackage({});
    const file = join(generated(), 'pg.ts');
    const text = renderMigrationsModule(
      'PostgreSQL',
      'PG_MIGRATIONS',
      readMigrations('pg', migrations()),
    );
    writeFileSync(file, text.replaceAll('\n', '\r\n'));
    expect(checkEmbedded(migrations(), generated())).toEqual([]);
  });

  it('fails when a SQL file was edited after it was embedded', () => {
    makePackage({});
    writeFileSync(join(migrations(), 'pg', '0000_baseline.sql'), `${BASELINE}\n-- edited\n`);
    const problems = checkEmbedded(migrations(), generated());
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatchObject({
      check: 'embedded',
      file: 'src/migrations/generated/pg.ts',
    });
    expect(problems[0]!.message).toContain('pnpm db:generate');
  });

  it('fails when a migration was added without embedding it', () => {
    makePackage({});
    writeFileSync(
      join(migrations(), 'sqlite', '0001_more.sql'),
      'CREATE TABLE `more` (`id` text);',
    );
    writeFileSync(
      join(migrations(), 'sqlite', 'meta', '_journal.json'),
      JSON.stringify({ entries: [{ tag: '0000_baseline' }, { tag: '0001_more' }] }),
    );
    const problems = checkEmbedded(migrations(), generated());
    expect(problems.map((problem) => problem.file)).toEqual(['src/migrations/generated/sqlite.ts']);
  });

  it('fails when a module file is missing', () => {
    makePackage({});
    rmSync(join(generated(), 'sqlite.ts'));
    const problems = checkEmbedded(migrations(), generated());
    expect(problems).toHaveLength(1);
    expect(problems[0]!.message).toContain('missing');
  });

  it('fails when the files and the journal disagree, or a name is out of order', () => {
    makePackage({});
    writeFileSync(
      join(migrations(), 'pg', 'meta', '_journal.json'),
      JSON.stringify({ entries: [{ tag: '0000_baseline' }, { tag: '0001_ghost' }] }),
    );
    const journal = checkEmbedded(migrations(), generated());
    expect(journal).toHaveLength(1);
    expect(journal[0]).toMatchObject({ check: 'embedded', file: 'migrations/pg' });
    expect(journal[0]!.message).toContain('journal');

    rmSync(root, { recursive: true, force: true });
    mkdirSync(root);
    makePackage({ sqlite: { '0001_baseline.sql': BASELINE } }, { embed: false });
    const numbering = checkEmbedded(migrations(), generated());
    expect(numbering[0]!.message).toContain('expected a name like 0000_<slug>.sql');
  });
});

describe('checkSchemaInSync', () => {
  const options = (generate: GenerateRunner) => ({
    packageDir: root,
    migrationsRoot: migrations(),
    generate,
  });

  it('passes when drizzle-kit would write nothing', () => {
    makePackage({});
    const seen: string[] = [];
    const generate: GenerateRunner = (request) => {
      seen.push(request.dialect);
      return { status: 0, output: 'No schema changes, nothing to migrate' };
    };
    expect(checkSchemaInSync(options(generate))).toEqual([]);
    expect(seen).toEqual(['sqlite', 'postgresql']);
  });

  it('runs on a copy of the folder and never writes the real one', () => {
    makePackage({});
    const before = readdirSync(join(migrations(), 'pg'));
    const scratch: string[] = [];
    const generate: GenerateRunner = (request) => {
      scratch.push(request.cwd);
      // What drizzle-kit does: write the migration and the snapshot into `out`.
      writeFileSync(
        join(request.cwd, request.out, '0001_new_table.sql'),
        'CREATE TABLE "n" ("id" text);',
      );
      return { status: 0, output: '' };
    };

    const problems = checkSchemaInSync(options(generate));

    expect(problems.map((problem) => problem.file)).toEqual([
      'migrations/sqlite/0001_new_table.sql',
      'migrations/pg/0001_new_table.sql',
    ]);
    expect(problems[0]).toMatchObject({
      check: 'schema',
      statement: 'CREATE TABLE "n" ("id" text);',
    });
    expect(problems[0]!.message).toContain('pnpm db:generate');
    expect(readdirSync(join(migrations(), 'pg'))).toEqual(before);
    expect(existsSync(join(migrations(), 'sqlite', '0001_new_table.sql'))).toBe(false);
    // The copies are removed afterwards.
    expect(scratch).toHaveLength(2);
    for (const directory of scratch) expect(existsSync(directory)).toBe(false);
  });

  it('points drizzle-kit at the schema of each dialect and the copy of the folder', () => {
    makePackage({});
    const requests: Array<{ schema: string; out: string; copied: string[] }> = [];
    checkSchemaInSync(
      options((request) => {
        requests.push({
          schema: request.schema,
          out: request.out,
          copied: readdirSync(join(request.cwd, request.out)).sort(),
        });
        return { status: 0, output: '' };
      }),
    );
    expect(requests.map((request) => request.schema.replace(/^.*\/src\//, 'src/'))).toEqual([
      'src/schema/sqlite/index.ts',
      'src/schema/pg/index.ts',
    ]);
    expect(requests.map((request) => request.out)).toEqual(['./sqlite', './pg']);
    for (const request of requests) expect(request.copied).toEqual(['0000_baseline.sql', 'meta']);
  });

  it('fails with the output when drizzle-kit exits with an error, as it does at a prompt', () => {
    makePackage({});
    const problems = checkSchemaInSync(
      options(() => ({ status: 1, output: 'Is "a" created or renamed from "b"?\nError: no TTY' })),
    );
    expect(problems).toHaveLength(2);
    expect(problems[0]).toMatchObject({ check: 'schema', file: 'src/schema/sqlite/index.ts' });
    expect(problems[0]!.message).toContain('failed with status 1');
    expect(problems[0]!.message).toContain('pnpm db:generate');
    expect(problems[0]!.statement).toContain('Error: no TTY');
  });

  it('fails when drizzle-kit does not finish', () => {
    makePackage({});
    const problems = checkSchemaInSync(options(() => ({ status: null, output: 'timed out' })));
    expect(problems[0]!.message).toContain('did not finish');
  });
});

describe('runChecks and main', () => {
  const clean: GenerateRunner = () => ({ status: 0, output: '' });

  it('collects the problems of all three checks', () => {
    makePackage({ pg: { '0000_baseline.sql': BASELINE, '0001_drop.sql': 'DROP TABLE "things";' } });
    // 0001_drop.sql is in the journal but was never embedded: the module is stale.
    writeFileSync(
      join(generated(), 'pg.ts'),
      renderMigrationsModule(
        'PostgreSQL',
        'PG_MIGRATIONS',
        readMigrations('pg', migrations()).slice(0, 1),
      ),
    );
    const generate: GenerateRunner = (request) => {
      writeFileSync(join(request.cwd, request.out, '0001_new.sql'), 'SELECT 1;');
      return { status: 0, output: '' };
    };
    const checks = runChecks({ packageDir: root, generate }).map((problem) => problem.check);
    expect(new Set(checks)).toEqual(new Set(['schema', 'embedded', 'safety']));
  });

  it('can skip the schema check', () => {
    makePackage({});
    const generate = vi.fn(clean);
    expect(runChecks({ packageDir: root, generate, skipSchema: true })).toEqual([]);
    expect(generate).not.toHaveBeenCalled();
  });

  it('exits 0 and prints one line when everything is in order', () => {
    makePackage({});
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    expect(main([], { packageDir: root, generate: clean })).toBe(0);
    expect(log).toHaveBeenCalledWith(expect.stringContaining('in order'));
    log.mockRestore();
  });

  it('exits 1 and prints the file and the statement of each problem', () => {
    makePackage({
      sqlite: { '0000_baseline.sql': BASELINE, '0001_drop.sql': 'DROP TABLE `things`;' },
    });
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(main(['--no-schema'], { packageDir: root })).toBe(1);
    const printed = error.mock.calls.map((call) => String(call[0])).join('\n');
    expect(printed).toContain('0001_drop.sql');
    expect(printed).toContain('DROP TABLE `things`');
    expect(printed).toContain('[safety]');
    expect(printed).toContain('1 problem(s)');
    error.mockRestore();
  });

  it('exits 1 when a check cannot run', () => {
    // No migrations folder at all: copying it for the schema check fails.
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(main([], { packageDir: join(root, 'missing'), generate: clean })).toBe(1);
    expect(error).toHaveBeenCalledWith(expect.stringContaining('could not run'));
    error.mockRestore();
  });

  it('formats a problem with its file relative to the working directory', () => {
    const text = formatProblem(
      {
        check: 'safety',
        file: 'migrations/pg/0001_x.sql',
        message: 'Oops',
        statement: 'DROP TABLE a;',
      },
      root,
      root,
    );
    expect(text).toBe('✖ [safety] migrations/pg/0001_x.sql: Oops\n    DROP TABLE a;');
    expect(formatProblem({ check: 'embedded', file: 'f.ts', message: 'Bad' }, root, root)).toBe(
      '✖ [embedded] f.ts: Bad',
    );
  });

  it('passes for this repository, apart from the drizzle-kit run', () => {
    const problems = runChecks({ skipSchema: true });
    expect(problems).toEqual([]);
  });
});
