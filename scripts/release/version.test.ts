import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  checkVersion,
  compareVersions,
  isVersion,
  main,
  readVersions,
  REPO_ROOT,
  setVersion,
} from './version';
import { VERSION_FILES, type VersionFile } from './version-files';

/** The version every place holds in the repository right now. */
const CURRENT = readVersions()[0]?.from ?? '';

let root: string;

const read = (path: string) => readFileSync(join(root, path), 'utf8');
const write = (path: string, text: string) => writeFileSync(join(root, path), text);

beforeEach(() => {
  // A copy of the real files, so the tests change nothing in the repository.
  root = mkdtempSync(join(tmpdir(), 'ririko-version-'));
  for (const file of VERSION_FILES) {
    mkdirSync(join(root, dirname(file.path)), { recursive: true });
    copyFileSync(join(REPO_ROOT, file.path), join(root, file.path));
  }
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
  vi.restoreAllMocks();
});

/** Every file as text, to compare the copy before and after a refusal. */
function snapshot(): Record<string, string> {
  return Object.fromEntries(VERSION_FILES.map((file) => [file.path, read(file.path)]));
}

describe('version files', () => {
  it('lists the 17 places: ten package.json files, two constants, five tests', () => {
    expect(VERSION_FILES).toHaveLength(17);
    expect(VERSION_FILES.filter((file) => file.path.endsWith('package.json'))).toHaveLength(10);
    expect(VERSION_FILES.map((file) => file.path)).not.toContain('apps/starter/package.json');
    expect(VERSION_FILES.map((file) => file.path)).not.toContain(
      'packages/music-private/package.json',
    );
  });

  it('matches each place exactly once, and all places hold the same version', () => {
    const versions = readVersions();
    expect(versions).toHaveLength(17);
    expect(isVersion(CURRENT)).toBe(true);
    expect(new Set(versions.map((place) => place.from))).toEqual(new Set([CURRENT]));
  });
});

describe('isVersion and compareVersions', () => {
  it('accepts only x.y.z', () => {
    expect(isVersion('2.1.3')).toBe(true);
    expect(isVersion('10.0.12')).toBe(true);
    for (const bad of ['', '2.1', 'v2.1.3', '2.1.3-rc.1', '2.1.3.4', '02.1.3', '2.x.3', ' 2.1.3']) {
      expect(isVersion(bad)).toBe(false);
    }
  });

  it('compares numbers, not text', () => {
    expect(compareVersions('2.10.0', '2.9.0')).toBeGreaterThan(0);
    expect(compareVersions('2.1.0', '2.1.0')).toBe(0);
    expect(compareVersions('1.99.99', '2.0.0')).toBeLessThan(0);
  });
});

describe('setVersion', () => {
  it('sets the version in all 17 places and reports old and new', () => {
    const changes = setVersion('9.8.7', root);
    expect(changes).toHaveLength(17);
    expect(changes.every((change) => change.from === CURRENT && change.to === '9.8.7')).toBe(true);
    expect(readVersions(root).every((place) => place.from === '9.8.7')).toBe(true);
    expect(read('packages/core/src/index.ts')).toContain("CORE_VERSION = '9.8.7'");
    expect(read('scripts/website-demo-reply.test.ts')).toContain('Bot Version: `v9.8.7`');
  });

  it('changes only the version, never other text that contains the old version', () => {
    const decoy = `// sample ${CURRENT}.5 and 10.${CURRENT} and v${CURRENT}-rc.1\n`;
    const before = read('apps/cli/src/program.test.ts');
    write('apps/cli/src/program.test.ts', before + decoy);
    const withDecoy = read('apps/cli/src/program.test.ts');

    setVersion('9.8.7', root);

    expect(read('apps/cli/src/program.test.ts')).toBe(
      withDecoy.replace(`toBe('${CURRENT}')`, "toBe('9.8.7')"),
    );
    expect(read('apps/cli/src/program.test.ts')).toContain(decoy);
  });

  it('leaves dependency versions in a package.json alone', () => {
    const text = read('apps/web/package.json');
    setVersion('9.8.7', root);
    const after = read('apps/web/package.json');
    expect(after).toBe(text.replace(`"version": "${CURRENT}"`, '"version": "9.8.7"'));
  });

  it('keeps the line endings of each file', () => {
    const crlf = read('packages/core/src/index.ts').replace(/\r?\n/g, '\r\n');
    const lf = read('packages/core/package.json').replace(/\r\n/g, '\n');
    write('packages/core/src/index.ts', crlf);
    write('packages/core/package.json', lf);

    setVersion('9.8.7', root);

    expect(read('packages/core/src/index.ts')).toBe(crlf.replace(CURRENT, '9.8.7'));
    expect(read('packages/core/package.json')).toBe(lf.replace(CURRENT, '9.8.7'));
  });

  it('refuses a value that is not x.y.z and changes nothing', () => {
    const before = snapshot();
    for (const bad of ['v9.8.7', '9.8', '9.8.7-rc.1', 'latest', '']) {
      expect(() => setVersion(bad, root)).toThrow(/not a version like/);
    }
    expect(snapshot()).toEqual(before);
  });

  it('refuses a version that is not greater than the current one and changes nothing', () => {
    const before = snapshot();
    expect(() => setVersion(CURRENT, root)).toThrow(/not greater than the current version/);
    expect(() => setVersion('0.0.1', root)).toThrow(/not greater than the current version/);
    expect(snapshot()).toEqual(before);
  });

  it('refuses when a pattern matches nothing, naming the file, and changes nothing', () => {
    write('packages/core/src/index.ts', 'export const OTHER = 1;\n');
    const before = snapshot();
    expect(() => setVersion('9.8.7', root)).toThrow(/packages\/core\/src\/index\.ts.*0 times/);
    expect(snapshot()).toEqual(before);
  });

  it('refuses when a pattern matches twice and changes nothing', () => {
    const text = read('packages/core/src/index.ts');
    write('packages/core/src/index.ts', `${text}\n${text}`);
    const before = snapshot();
    expect(() => setVersion('9.8.7', root)).toThrow(/packages\/core\/src\/index\.ts.*2 times/);
    expect(snapshot()).toEqual(before);
  });

  it('refuses when a file is missing and changes nothing', () => {
    rmSync(join(root, 'website/package.json'));
    const before = Object.fromEntries(
      VERSION_FILES.filter((file) => file.path !== 'website/package.json').map((file) => [
        file.path,
        read(file.path),
      ]),
    );
    expect(() => setVersion('9.8.7', root)).toThrow(/website\/package\.json: cannot read/);
    for (const [path, text] of Object.entries(before)) expect(read(path)).toBe(text);
  });

  it('refuses a pattern without a capture group', () => {
    const files: VersionFile[] = [{ path: 'package.json', pattern: /"version"/ }];
    expect(() => setVersion('9.8.7', root, files)).toThrow(/no capture group/);
  });

  it('refuses when the current version file is not in the list', () => {
    const files = VERSION_FILES.filter((file) => file.path !== 'package.json');
    expect(() => setVersion('9.8.7', root, files)).toThrow(/is not in the list/);
  });

  it('refuses when the current version is not x.y.z', () => {
    const text = read('package.json');
    write('package.json', text.replace(`"version": "${CURRENT}"`, '"version": "2.1.0-rc.1"'));
    expect(() => setVersion('9.8.7', root)).toThrow(/not an x\.y\.z version/);
  });
});

describe('checkVersion', () => {
  it('finds no place that differs when all hold the version', () => {
    expect(checkVersion(CURRENT, root)).toEqual([]);
  });

  it('lists the places that hold another version', () => {
    const text = read('apps/bot/src/index.test.ts');
    write('apps/bot/src/index.test.ts', text.replace(`toBe('${CURRENT}')`, "toBe('1.0.0')"));
    expect(checkVersion(CURRENT, root)).toEqual([
      { path: 'apps/bot/src/index.test.ts', from: '1.0.0', to: CURRENT },
    ]);
  });

  it('rejects a value that is not x.y.z', () => {
    expect(() => checkVersion('v2.1.0', root)).toThrow(/not a version like/);
  });
});

describe('main', () => {
  it('prints each file and old to new, and exits 0', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    expect(main(['9.8.7'], root)).toBe(0);
    expect(log).toHaveBeenCalledTimes(17);
    expect(log).toHaveBeenCalledWith(`package.json: ${CURRENT} -> 9.8.7`);
  });

  it('exits 1 with a message for a refusal', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const before = snapshot();
    expect(main(['1.0.0'], root)).toBe(1);
    expect(error).toHaveBeenCalledWith(expect.stringContaining('not greater than'));
    expect(main(['nonsense'], root)).toBe(1);
    expect(snapshot()).toEqual(before);
  });

  it('exits 1 and prints the usage without a value or with extra arguments', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(main([], root)).toBe(1);
    expect(main(['9.8.7', '9.8.8'], root)).toBe(1);
    expect(main(['--check'], root)).toBe(1);
    expect(error).toHaveBeenCalledWith(expect.stringContaining('Usage:'));
  });

  it('--check exits 0 when every place holds the version', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    expect(main(['--check', CURRENT], root)).toBe(0);
    expect(log).toHaveBeenCalledWith(`Every place holds ${CURRENT}.`);
  });

  it('--check exits 1 and lists the places when one differs', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const before = snapshot();
    expect(main(['--check', '9.8.7'], root)).toBe(1);
    expect(error).toHaveBeenCalledTimes(17);
    expect(snapshot()).toEqual(before);
  });

  it('--check, after a set, passes for the new version', () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    expect(main(['9.8.7'], root)).toBe(0);
    expect(main(['--check', '9.8.7'], root)).toBe(0);
  });
});
