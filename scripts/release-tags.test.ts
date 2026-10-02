import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { main, RELEASE_TAG_PATTERN, releaseTags } from './release-tags';

describe('release workflow', () => {
  const config = readFileSync(new URL('../.circleci/config.yml', import.meta.url), 'utf8');

  it('runs on the same tags the script accepts', () => {
    const filter = /^\s+only: \/(.+)\/\s*$/m.exec(config)?.[1];
    // The script captures each number; CircleCI only matches.
    expect(filter).toBe(RELEASE_TAG_PATTERN.source.replace(/\((\\d\+)\)/g, '$1'));
  });

  it('never names latest as an image tag', () => {
    expect(config).not.toMatch(/ririkobot(-dashboard)?:latest/);
  });
});

describe('releaseTags', () => {
  it('pushes the full, minor and major version for a release', () => {
    expect(releaseTags('v2.1.3')).toEqual(['2.1.3', '2.1', '2']);
    expect(releaseTags('v10.0.12')).toEqual(['10.0.12', '10.0', '10']);
  });

  it('pushes only the full version for a prerelease', () => {
    expect(releaseTags('v2.0.0-rc.1')).toEqual(['2.0.0-rc.1']);
    expect(releaseTags('v2.0.0-beta')).toEqual(['2.0.0-beta']);
  });

  it('never produces latest', () => {
    for (const tag of ['v2.0.0', 'v2.0.0-rc.1', 'v1.4.0']) {
      expect(releaseTags(tag)).not.toContain('latest');
    }
  });

  it('rejects anything that is not a release tag', () => {
    for (const tag of ['2.1.3', 'v2.1', 'v2', 'latest', 'v2.1.3-', 'release-2.1.3', '']) {
      expect(() => releaseTags(tag)).toThrow('is not a release tag');
    }
  });
});

describe('main', () => {
  it('prints one tag per line', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    expect(main(['v2.1.3'])).toBe(0);
    expect(log.mock.calls.map(([line]) => line)).toEqual(['2.1.3', '2.1', '2']);
    log.mockRestore();
  });

  it('fails without a valid tag', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(main([])).toBe(1);
    expect(main(['main'])).toBe(1);
    expect(error).toHaveBeenCalledTimes(2);
    error.mockRestore();
  });
});
