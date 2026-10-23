/**
 * Sets the Ririko version in every place that holds it (scripts/release/version-files.ts).
 *
 *   pnpm release:version 2.2.0           sets 2.2.0 everywhere
 *   pnpm release:version --check 2.2.0   exits 1 unless every place already holds 2.2.0
 *
 * It refuses a value that is not x.y.z, a version not greater than the current one, and a file
 * whose pattern does not match exactly once. In every refusal nothing is written.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { CURRENT_VERSION_FILE, VERSION_FILES, type VersionFile } from './version-files';

const VERSION_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

/** The repository root: two levels above scripts/release. */
export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

export interface VersionChange {
  path: string;
  from: string;
  to: string;
}

/** True for a version like 2.1.3. Prereleases and a leading "v" are not accepted. */
export function isVersion(value: string): boolean {
  return VERSION_PATTERN.test(value);
}

/** Orders two x.y.z versions: negative, zero or positive like Array.sort. */
export function compareVersions(a: string, b: string): number {
  const left = a.split('.').map(Number);
  const right = b.split('.').map(Number);
  for (let index = 0; index < 3; index++) {
    const difference = (left[index] as number) - (right[index] as number);
    if (difference !== 0) return difference;
  }
  return 0;
}

interface Located {
  file: VersionFile;
  text: string;
  /** Offset and length of the version inside `text`. */
  start: number;
  length: number;
  version: string;
}

/** Reads one place and finds its version. Throws unless the pattern matches exactly once. */
function locate(root: string, file: VersionFile): Located {
  let text: string;
  try {
    text = readFileSync(join(root, file.path), 'utf8');
  } catch {
    throw new Error(`${file.path}: cannot read the file`);
  }
  const flags = file.pattern.flags.includes('g') ? file.pattern.flags : `${file.pattern.flags}g`;
  const matches = [...text.matchAll(new RegExp(file.pattern.source, flags))];
  if (matches.length !== 1) {
    throw new Error(
      `${file.path}: the version pattern matches ${matches.length} times, expected exactly 1`,
    );
  }
  const match = matches[0] as RegExpMatchArray;
  const version = match[1];
  if (version === undefined) {
    throw new Error(`${file.path}: the version pattern has no capture group`);
  }
  // The group sits inside the match; search from the end so an equal text before it is skipped.
  const start = (match.index as number) + match[0].lastIndexOf(version);
  return { file, text, start, length: version.length, version };
}

/** The version in every place, or an error for the first place that cannot be read. */
export function readVersions(
  root: string = REPO_ROOT,
  files: readonly VersionFile[] = VERSION_FILES,
): VersionChange[] {
  return files.map((file) => {
    const found = locate(root, file);
    return { path: file.path, from: found.version, to: found.version };
  });
}

/**
 * Sets `next` in every place. Reads and checks all places first and writes only when every check
 * passed, so a refusal changes nothing. Returns the old and new value of each place.
 */
export function setVersion(
  next: string,
  root: string = REPO_ROOT,
  files: readonly VersionFile[] = VERSION_FILES,
): VersionChange[] {
  if (!isVersion(next)) {
    throw new Error(`"${next}" is not a version like 2.1.3 (x.y.z, no "v", no prerelease)`);
  }
  const located = files.map((file) => locate(root, file));
  const current = located.find((place) => place.file.path === CURRENT_VERSION_FILE);
  if (!current) {
    throw new Error(`${CURRENT_VERSION_FILE} is not in the list of version files`);
  }
  if (!isVersion(current.version)) {
    throw new Error(`${CURRENT_VERSION_FILE} holds "${current.version}", not an x.y.z version`);
  }
  if (compareVersions(next, current.version) <= 0) {
    throw new Error(`${next} is not greater than the current version ${current.version}`);
  }
  for (const place of located) {
    const text =
      place.text.slice(0, place.start) + next + place.text.slice(place.start + place.length);
    writeFileSync(join(root, place.file.path), text);
  }
  return located.map((place) => ({ path: place.file.path, from: place.version, to: next }));
}

/** The places that do not hold `expected`; an empty list means the check passes. */
export function checkVersion(
  expected: string,
  root: string = REPO_ROOT,
  files: readonly VersionFile[] = VERSION_FILES,
): VersionChange[] {
  if (!isVersion(expected)) {
    throw new Error(`"${expected}" is not a version like 2.1.3 (x.y.z, no "v", no prerelease)`);
  }
  return readVersions(root, files)
    .filter((place) => place.from !== expected)
    .map((place) => ({ ...place, to: expected }));
}

const USAGE = 'Usage: pnpm release:version <x.y.z>   or   pnpm release:version --check <x.y.z>';

export function main(argv: string[], root: string = REPO_ROOT): number {
  try {
    const check = argv[0] === '--check';
    const args = check ? argv.slice(1) : argv;
    const value = args[0];
    if (args.length !== 1 || value === undefined) {
      console.error(USAGE);
      return 1;
    }
    if (check) {
      const wrong = checkVersion(value, root);
      if (wrong.length > 0) {
        for (const place of wrong)
          console.error(`✖ ${place.path}: ${place.from}, expected ${value}`);
        return 1;
      }
      console.log(`Every place holds ${value}.`);
      return 0;
    }
    for (const place of setVersion(value, root)) {
      console.log(`${place.path}: ${place.from} -> ${place.to}`);
    }
    return 0;
  } catch (error) {
    console.error(`✖ ${error instanceof Error ? error.message : String(error)}`);
    return 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  process.exitCode = main(process.argv.slice(2));
}
