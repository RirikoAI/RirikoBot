import { describe, expect, it } from 'vitest';
import { StarterError } from '../src/errors.js';
import {
  compareTags,
  findLatestRelease,
  highestStableTag,
  imageTag,
  isStableTag,
  type FetchLike,
} from '../src/release.js';

const LATEST = 'https://api.github.com/repos/RirikoAI/RirikoBot/releases/latest';
const tagsUrl = (page: number): string =>
  `https://api.github.com/repos/RirikoAI/RirikoBot/tags?per_page=100&page=${page}`;

interface Reply {
  status?: number;
  body?: unknown;
  throws?: Error;
  badJson?: boolean;
}

function fakeFetch(replies: Record<string, Reply>): { fetch: FetchLike; urls: string[] } {
  const urls: string[] = [];
  const fetchFn: FetchLike = async (url, init) => {
    urls.push(url);
    expect(init?.headers?.['User-Agent']).toBe('test-agent');
    const reply = replies[url];
    if (!reply) throw new Error(`unexpected request ${url}`);
    if (reply.throws) throw reply.throws;
    const status = reply.status ?? 200;
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => {
        if (reply.badJson) throw new SyntaxError('bad json');
        return reply.body;
      },
      text: async () => JSON.stringify(reply.body),
    };
  };
  return { fetch: fetchFn, urls };
}

describe('tag helpers', () => {
  it('accepts only vX.Y.Z without a dash', () => {
    expect(isStableTag('v2.0.0')).toBe(true);
    expect(isStableTag('v2.0.0-rc.8')).toBe(false);
    expect(isStableTag('1.4.0')).toBe(false);
    expect(isStableTag('v2.0')).toBe(false);
  });

  it('compares by version number, not by text', () => {
    expect(compareTags('v2.10.0', 'v2.9.9')).toBeGreaterThan(0);
    expect(compareTags('v1.0.0', 'v2.0.0')).toBeLessThan(0);
    expect(compareTags('v2.0.1', 'v2.0.0')).toBeGreaterThan(0);
    expect(compareTags('v2.0.0', 'v2.0.0')).toBe(0);
  });

  it('picks the highest stable tag', () => {
    expect(highestStableTag(['v2.0.0-rc.8', 'v2.0.0', 'v2.1.0', '1.4.0', 'v2.0.5'])).toBe('v2.1.0');
    expect(highestStableTag(['v2.0.0-rc.8', 'latest'])).toBeNull();
    expect(highestStableTag([])).toBeNull();
  });

  it('turns a tag into an image tag', () => {
    expect(imageTag('v2.0.0')).toBe('2.0.0');
    expect(imageTag('v2.0.0-rc.8')).toBe('2.0.0-rc.8');
  });
});

describe('findLatestRelease', () => {
  it('uses the latest release when its tag is stable', async () => {
    const { fetch, urls } = fakeFetch({ [LATEST]: { body: { tag_name: 'v2.0.3' } } });
    await expect(findLatestRelease(fetch, 'test-agent')).resolves.toBe('v2.0.3');
    expect(urls).toEqual([LATEST]);
  });

  it('falls back to the tags when there is no release', async () => {
    const { fetch, urls } = fakeFetch({
      [LATEST]: { status: 404 },
      [tagsUrl(1)]: {
        body: [{ name: 'v2.0.0-rc.8' }, { name: 'v2.0.0' }, { name: 'v2.0.1' }, { name: '1.4.0' }],
      },
    });
    await expect(findLatestRelease(fetch, 'test-agent')).resolves.toBe('v2.0.1');
    expect(urls).toEqual([LATEST, tagsUrl(1)]);
  });

  it('falls back to the tags when the latest release is not a stable vX.Y.Z', async () => {
    const { fetch } = fakeFetch({
      [LATEST]: { body: { tag_name: '1.4.0' } },
      [tagsUrl(1)]: { body: [{ name: 'v2.0.0' }] },
    });
    await expect(findLatestRelease(fetch, 'test-agent')).resolves.toBe('v2.0.0');
  });

  it('reads the next page when a page is full', async () => {
    const full = Array.from({ length: 100 }, (_, index) => ({ name: `v1.0.${index}` }));
    const { fetch, urls } = fakeFetch({
      [LATEST]: { status: 404 },
      [tagsUrl(1)]: { body: full },
      [tagsUrl(2)]: { body: [{ name: 'v2.0.0' }] },
    });
    await expect(findLatestRelease(fetch, 'test-agent')).resolves.toBe('v2.0.0');
    expect(urls).toEqual([LATEST, tagsUrl(1), tagsUrl(2)]);
  });

  it('stops when the tags are missing or are not a list', async () => {
    const missing = fakeFetch({ [LATEST]: { status: 404 }, [tagsUrl(1)]: { status: 404 } });
    await expect(findLatestRelease(missing.fetch, 'test-agent')).rejects.toThrow(
      'No Ririko release was found',
    );
    const odd = fakeFetch({ [LATEST]: { body: null }, [tagsUrl(1)]: { body: { oops: true } } });
    await expect(findLatestRelease(odd.fetch, 'test-agent')).rejects.toBeInstanceOf(StarterError);
  });

  it('fails clearly when there is no stable tag at all', async () => {
    const { fetch } = fakeFetch({
      [LATEST]: { status: 404 },
      [tagsUrl(1)]: { body: [{ name: 'v2.0.0-rc.8' }, { other: 1 }] },
    });
    await expect(findLatestRelease(fetch, 'test-agent')).rejects.toThrow('--ref');
  });

  it('explains a network error', async () => {
    const { fetch } = fakeFetch({ [LATEST]: { throws: new Error('getaddrinfo ENOTFOUND') } });
    await expect(findLatestRelease(fetch, 'test-agent')).rejects.toThrow(
      /Could not reach GitHub.*ENOTFOUND.*--ref/s,
    );
  });

  it('explains a non-Error rejection', async () => {
    const throwing: FetchLike = () => Promise.reject('offline');
    await expect(findLatestRelease(throwing, 'test-agent')).rejects.toThrow(/offline/);
  });

  it('explains a rate limit and other HTTP errors', async () => {
    for (const status of [403, 429]) {
      const { fetch } = fakeFetch({ [LATEST]: { status } });
      await expect(findLatestRelease(fetch, 'test-agent')).rejects.toThrow(/rate limit/);
    }
    const server = fakeFetch({ [LATEST]: { status: 500 } });
    await expect(findLatestRelease(server.fetch, 'test-agent')).rejects.toThrow('HTTP 500');
  });

  it('explains an answer that is not JSON', async () => {
    const { fetch } = fakeFetch({ [LATEST]: { badJson: true } });
    await expect(findLatestRelease(fetch, 'test-agent')).rejects.toThrow('not JSON');
  });
});
