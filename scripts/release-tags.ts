/**
 * Docker Hub tags for a release git tag (the CircleCI `release` workflow, docs/release.md).
 *
 *   node scripts/release-tags.ts v2.1.3      -> 2.1.3, 2.1, 2
 *   node scripts/release-tags.ts v2.1.3-rc.1 -> 2.1.3-rc.1
 *
 * Prints one tag per line. `latest` is never produced: the maintainer moves it by hand after the
 * 1.4.0 sunset.
 */
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

/** The git tags the release workflow runs on; keep in sync with .circleci/config.yml. */
export const RELEASE_TAG_PATTERN = /^v(\d+)\.(\d+)\.(\d+)(-.+)?$/;

/**
 * The image tags for `gitTag`: `X.Y.Z`, `X.Y` and `X` for a release, only the full version for
 * a prerelease. Throws for anything that is not a release tag.
 */
export function releaseTags(gitTag: string): string[] {
  const match = RELEASE_TAG_PATTERN.exec(gitTag);
  if (!match) throw new Error(`"${gitTag}" is not a release tag like v2.1.3 or v2.1.3-rc.1`);
  const [, major, minor, patch, prerelease] = match;
  const version = `${major}.${minor}.${patch}`;
  if (prerelease) return [`${version}${prerelease}`];
  return [version, `${major}.${minor}`, `${major}`];
}

export function main(argv: string[]): number {
  try {
    for (const tag of releaseTags(argv[0] ?? '')) console.log(tag);
    return 0;
  } catch (error) {
    console.error(`✖ ${error instanceof Error ? error.message : String(error)}`);
    return 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  process.exitCode = main(process.argv.slice(2));
}
