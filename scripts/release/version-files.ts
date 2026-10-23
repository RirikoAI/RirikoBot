/**
 * Every place that holds the Ririko version (the files CHORE-2011 changed by hand for 2.1.0).
 *
 * Each place has its own pattern with one capture group around the version, so the script never
 * searches for the old version as plain text: strings such as 10.0.2.2 or a sample tag that
 * merely contain it stay as they are. `apps/starter` (the npm starter), `packages/services` and
 * `packages/music-private` (a separate repository) keep their own versions and are not listed.
 */
export interface VersionFile {
  /** Path from the repository root, with forward slashes. */
  path: string;
  /** Matches exactly once in the file. Group 1 is the version. */
  pattern: RegExp;
}

/** The "version" field of a package.json: two-space indent, so no nested "version" key matches. */
const PACKAGE_VERSION = /^ {2}"version": "([^"]+)"/m;

const packageJson = (path: string): VersionFile => ({ path, pattern: PACKAGE_VERSION });

export const VERSION_FILES: readonly VersionFile[] = [
  packageJson('package.json'),
  packageJson('apps/bot/package.json'),
  packageJson('apps/cli/package.json'),
  packageJson('apps/web/package.json'),
  packageJson('packages/ai/package.json'),
  packageJson('packages/core/package.json'),
  packageJson('packages/database/package.json'),
  packageJson('packages/discord/package.json'),
  packageJson('packages/music/package.json'),
  packageJson('website/package.json'),
  {
    path: 'packages/core/src/index.ts',
    pattern: /export const CORE_VERSION = '([^']+)'/,
  },
  {
    path: 'website/src/components/DiscordDemo/reply.ts',
    pattern: /export const BOT_VERSION = '([^']+)'/,
  },
  {
    path: 'apps/bot/src/index.test.ts',
    pattern: /expect\(info\.version\)\.toBe\('([^']+)'\)/,
  },
  {
    path: 'apps/cli/src/program.test.ts',
    pattern: /expect\(program\.version\(\)\)\.toBe\('([^']+)'\)/,
  },
  {
    path: 'apps/web/src/app/api/health/route.test.ts',
    pattern: /status: 'healthy', version: '([^']+)'/,
  },
  {
    path: 'packages/core/src/index.test.ts',
    pattern: /expect\(CORE_VERSION\)\.toBe\('([^']+)'\)/,
  },
  {
    // The demo prints the version with a leading "v".
    path: 'scripts/website-demo-reply.test.ts',
    pattern: /Bot Version: `v([^`]+)`/,
  },
];

/** The place whose version counts as "the current version" of the project. */
export const CURRENT_VERSION_FILE = 'package.json';
