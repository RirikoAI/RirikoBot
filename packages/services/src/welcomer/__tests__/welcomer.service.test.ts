import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import dns from 'node:dns/promises';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createCanvas } from '@napi-rs/canvas';
import { SecurityError } from '@ririko/core';
import {
  assertPublicUrl,
  fetchRemoteImage,
  isPrivateOrRestrictedIp,
} from '../../net/remote-image.js';
import { BackgroundUploadError, WelcomerBackgroundStore } from '../background-store.js';
import { fillWelcomerMessage, fillWelcomerText, WelcomerService } from '../welcomer.service.js';

const GUILD = '123456789012345678';

function png(width: number, height: number): Buffer {
  return createCanvas(width, height).toBuffer('image/png');
}

/** A PNG header claiming the given size; enough for the dimension check. */
function pngHeader(width: number, height: number): Buffer {
  const buffer = Buffer.alloc(24);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(buffer);
  buffer.writeUInt32BE(width, 16);
  buffer.writeUInt32BE(height, 20);
  return buffer;
}

function response(status: number, headers: Record<string, string>, body: Buffer = Buffer.alloc(0)) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: '',
    headers: new Headers(headers),
    arrayBuffer: async () => body.buffer.slice(body.byteOffset, body.byteOffset + body.length),
  } as Response;
}

describe('remote image checks (TASK-1663)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('treats every link-local fe80::/10 address and mapped IPv4 as restricted', () => {
    expect(isPrivateOrRestrictedIp('fe80::1')).toBe(true);
    expect(isPrivateOrRestrictedIp('febf::1')).toBe(true);
    expect(isPrivateOrRestrictedIp('::ffff:10.0.0.1')).toBe(true);
    expect(isPrivateOrRestrictedIp('192.0.2.1')).toBe(true);
    expect(isPrivateOrRestrictedIp('192.0.1.1')).toBe(false);
  });

  it('refuses local names, IPv6 literals and non-http schemes before resolving', async () => {
    const lookup = vi.spyOn(dns, 'lookup');
    await expect(assertPublicUrl('http://localhost/x.png')).rejects.toThrow(SecurityError);
    await expect(assertPublicUrl('http://app.localhost/x.png')).rejects.toThrow(SecurityError);
    await expect(assertPublicUrl('http://[::1]/x.png')).rejects.toThrow(SecurityError);
    await expect(assertPublicUrl('file:///etc/passwd')).rejects.toThrow(SecurityError);
    expect(lookup).not.toHaveBeenCalled();
  });

  it('checks every redirect target', async () => {
    vi.spyOn(dns, 'lookup').mockImplementation((async (host: string) =>
      host === 'evil.example'
        ? [{ address: '169.254.169.254', family: 4 }]
        : [{ address: '93.184.216.34', family: 4 }]) as never);
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(response(302, { location: 'http://evil.example/latest/meta-data' }));

    await expect(
      fetchRemoteImage('https://example.com/bg.png', { maxBytes: 1000, timeoutMs: 1000 }),
    ).rejects.toThrow(/SSRF_ATTEMPT_DETECTED/);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy.mock.calls[0]![1]).toMatchObject({ redirect: 'manual' });
  });

  it('follows a public redirect and enforces type and size', async () => {
    vi.spyOn(dns, 'lookup').mockResolvedValue([{ address: '93.184.216.34', family: 4 }] as never);
    const image = pngHeader(10, 10);
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(response(301, { location: '/moved.png' }))
      .mockResolvedValueOnce(response(200, { 'content-type': 'image/png' }, image));
    await expect(
      fetchRemoteImage('https://example.com/bg.png', { maxBytes: 1000, timeoutMs: 1000 }),
    ).resolves.toMatchObject({ contentType: 'image/png' });

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      response(200, { 'content-type': 'image/png' }, Buffer.alloc(2000)),
    );
    await expect(
      fetchRemoteImage('https://example.com/bg.png', { maxBytes: 1000, timeoutMs: 1000 }),
    ).rejects.toThrow(/exceeds maximum limit/);
  });
});

describe('WelcomerBackgroundStore (TASK-1663)', () => {
  let dir: string;
  let store: WelcomerBackgroundStore;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'ririko-bg-'));
    store = new WelcomerBackgroundStore(dir);
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('saves images under a name from the guild, card and content, and reads them back', async () => {
    const image = png(20, 10);
    const name = await store.save(GUILD, 'welcome', image);
    expect(name).toMatch(new RegExp(`^${GUILD}_welcome_[0-9a-f]{16}\\.png$`));
    expect(await store.read(name)).toEqual(image);
  });

  it('refuses files that are not images, too large or too big', async () => {
    await expect(store.save(GUILD, 'welcome', Buffer.from('<svg></svg>'))).rejects.toThrow(
      BackgroundUploadError,
    );
    await expect(store.save(GUILD, 'welcome', pngHeader(5000, 10))).rejects.toThrow(/4096/);
    await expect(store.save(GUILD, 'welcome', Buffer.alloc(3 * 1024 * 1024))).rejects.toThrow(
      /larger than 2 MB/,
    );
    await expect(store.save('../x', 'welcome', png(2, 2))).rejects.toThrow(BackgroundUploadError);
  });

  it('never reads names it did not write', async () => {
    await writeFile(path.join(dir, 'secret.txt'), 'x');
    expect(await store.read('secret.txt')).toBeNull();
    expect(await store.read(`../${GUILD}_welcome_0123456789abcdef.png`)).toBeNull();
    expect(await store.read(`${GUILD}_welcome_0123456789abcdef.png`)).toBeNull();
  });

  it('prunes only the other uploads of the same guild and card', async () => {
    const old = await store.save(GUILD, 'welcome', png(3, 3));
    const current = await store.save(GUILD, 'welcome', png(4, 4));
    const farewell = await store.save(GUILD, 'farewell', png(5, 5));
    await store.prune(GUILD, 'welcome', current);
    expect((await readdir(dir)).sort()).toEqual([current, farewell].sort());
    expect(await store.read(old)).toBeNull();
  });
});

describe('WelcomerService (TASK-1663)', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'ririko-bg-'));
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await rm(dir, { recursive: true, force: true });
  });

  it('replaces every variable in the message', () => {
    expect(
      fillWelcomerMessage('{user} {user} joined {server} (#{memberCount})', {
        userTag: 'ririko',
        serverName: 'Home',
        memberCount: 42,
      }),
    ).toBe('ririko ririko joined Home (#42)');
  });

  it('loads an uploaded background and ignores a link that points inside', async () => {
    const store = new WelcomerBackgroundStore(dir);
    const service = new WelcomerService(store);
    const file = await store.save(GUILD, 'welcome', png(8, 8));
    expect(
      await service.loadBackground({ backgroundFile: file, backgroundUrl: null }),
    ).not.toBeNull();

    vi.spyOn(dns, 'lookup').mockResolvedValue([{ address: '10.0.0.5', family: 4 }] as never);
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    expect(
      await service.loadBackground({
        backgroundFile: null,
        backgroundUrl: 'http://intranet.example/x.png',
      }),
    ).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('renders a PNG card with a background buffer', async () => {
    const service = new WelcomerService(new WelcomerBackgroundStore(dir));
    const card = await service.renderCard({
      userTag: 'ririko',
      avatarUrl: 'data:image/png;base64,' + png(4, 4).toString('base64'),
      memberCount: 3,
      serverName: 'Home',
      messageText: 'Welcome to {server}, {user}! '.repeat(6),
      background: png(40, 20),
    });
    expect(card.subarray(0, 4)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  });
});

describe('fillWelcomerText (TASK-1333)', () => {
  const channels = [
    { id: '111', name: 'rules' },
    { id: '222', name: 'General-Chat' },
    { id: '333', name: 'rules' },
  ];
  const values = {
    user: '<@42>',
    username: 'ririko',
    serverName: 'Home',
    memberCount: 7,
    channels,
  };

  it('replaces {user}, {username}, {server} and {memberCount} everywhere', () => {
    expect(
      fillWelcomerText(
        '{user} aka {username} joined {server} as member {memberCount}; {user}',
        values,
      ),
    ).toBe('<@42> aka ririko joined Home as member 7; <@42>');
    expect(fillWelcomerText('{unknown} {User}', values)).toBe('{unknown} {User}');
  });

  it('turns a #channel-name word into a channel mention, ignoring case', () => {
    expect(fillWelcomerText('Read #rules, then say hi in #general-chat.', values)).toBe(
      'Read <#111>, then say hi in <#222>.',
    );
    expect(fillWelcomerText('#RULES', values)).toBe('<#111>');
  });

  it('leaves unknown #words, partial names, mid-word hashes and existing mentions as typed', () => {
    expect(
      fillWelcomerText('#nowhere #rule #rules-extra issue#rules <#999> &#rules;', values),
    ).toBe('#nowhere #rule #rules-extra issue#rules <#999> &#rules;');
    expect(fillWelcomerText('see <#111> and #rules', values)).toBe('see <#111> and <#111>');
  });

  it('never resolves a channel name that arrives through a value', () => {
    expect(
      fillWelcomerText('Hi {username} from {server}', {
        ...values,
        username: '#rules',
        serverName: '#general-chat',
      }),
    ).toBe('Hi #rules from #general-chat');
  });

  it('keeps @everyone, @here and role mentions in the text as typed (the send blocks the pings)', () => {
    expect(fillWelcomerText('@everyone @here <@&5> {user}', values)).toBe(
      '@everyone @here <@&5> <@42>',
    );
  });

  it('cuts the result to 2000 characters, never inside a mention', () => {
    const exact = 'a'.repeat(2000);
    expect(fillWelcomerText(exact, values)).toBe(exact);
    const long = fillWelcomerText(`${'a'.repeat(1997)} #rules and more`, values);
    expect(long).toBe(`${'a'.repeat(1997)} `);
    expect(long.length).toBeLessThanOrEqual(2000);
    const whole = fillWelcomerText(`${'a'.repeat(1989)} #rules and more`, values);
    expect(whole).toBe(`${'a'.repeat(1989)} <#111> and`);
    expect(whole.length).toBeLessThanOrEqual(2000);
  });
});
