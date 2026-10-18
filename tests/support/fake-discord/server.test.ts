import { createHash } from 'node:crypto';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  ALL_PERMISSIONS,
  LOGIN_COOKIE,
  Permission,
  fetchRecordedRequests,
  fetchUnhandledRequests,
  ids,
  startFakeDiscord,
  type FakeDiscordServer,
} from './index.js';

let fake: FakeDiscordServer;
const api = (path: string) => `${fake.apiUrl}/v10${path}`;
const bot = { Authorization: 'Bot fake-token' };

beforeAll(async () => {
  fake = await startFakeDiscord();
});
afterEach(() => fake.reset());
afterAll(() => fake.close());

const redirectUri = 'http://localhost:3100/api/auth/callback';
const verifier = 'v'.repeat(43);

async function authorize(login: string) {
  const url = new URL(api('/oauth2/authorize'));
  url.search = new URLSearchParams({
    client_id: ids.application,
    response_type: 'code',
    redirect_uri: redirectUri,
    scope: 'identify guilds',
    state: 'state-1',
    code_challenge: createHash('sha256').update(verifier).digest('base64url'),
    code_challenge_method: 'S256',
  }).toString();
  const redirect = await fetch(url, {
    redirect: 'manual',
    headers: { Cookie: `${LOGIN_COOKIE}=${login}` },
  });
  const location = new URL(redirect.headers.get('location') ?? '');
  return { redirect, location, code: location.searchParams.get('code') ?? '' };
}

function exchange(code: string, codeVerifier: string) {
  return fetch(api('/oauth2/token'), {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${ids.application}:secret`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      code_verifier: codeVerifier,
    }),
  });
}

describe('fake Discord OAuth2', () => {
  it('signs in the user named by the login cookie with PKCE and serves their guilds', async () => {
    const { redirect, location, code } = await authorize('admin');
    expect(redirect.status).toBe(302);
    expect(location.origin + location.pathname).toBe(redirectUri);
    expect(location.searchParams.get('state')).toBe('state-1');
    const token = await exchange(code, verifier);
    expect(token.status).toBe(200);
    const tokens = (await token.json()) as { access_token: string; scope: string };
    expect(tokens.scope).toBe('identify guilds');

    const bearer = { Authorization: `Bearer ${tokens.access_token}` };
    const me = (await (await fetch(api('/users/@me'), { headers: bearer })).json()) as {
      id: string;
    };
    expect(me.id).toBe(ids.admin);

    const guilds = (await (
      await fetch(api('/users/@me/guilds?limit=200'), { headers: bearer })
    ).json()) as Array<{
      id: string;
      owner: boolean;
      permissions: string;
    }>;
    const main = guilds.find((g) => g.id === ids.mainGuild);
    const other = guilds.find((g) => g.id === ids.otherGuild);
    expect(main).toMatchObject({ owner: true, permissions: ALL_PERMISSIONS.toString() });
    expect(other?.owner).toBe(false);
    expect(BigInt(other?.permissions ?? '0') & Permission.ManageGuild).toBe(0n);
  });

  it('rejects a wrong PKCE verifier and never accepts the code again', async () => {
    const { code } = await authorize('member');
    expect((await exchange(code, 'wrong')).status).toBe(400);
    expect((await exchange(code, verifier)).status).toBe(400);
  });

  it('refuses to authorize without a login cookie or with an unknown client id', async () => {
    const base = {
      response_type: 'code',
      redirect_uri: 'http://localhost:3100/api/auth/callback',
      code_challenge: 'c',
      code_challenge_method: 'S256',
    };
    const noCookie = await fetch(
      `${api('/oauth2/authorize')}?${new URLSearchParams({ ...base, client_id: ids.application })}`,
      { redirect: 'manual' },
    );
    expect(noCookie.status).toBe(400);
    const wrongClient = await fetch(
      `${api('/oauth2/authorize')}?${new URLSearchParams({ ...base, client_id: '1' })}`,
      { redirect: 'manual', headers: { Cookie: `${LOGIN_COOKIE}=admin` } },
    );
    expect(wrongClient.status).toBe(400);
  });
});

describe('fake Discord REST', () => {
  it('records bot messages, including multipart payload_json and files', async () => {
    const created = await fetch(api(`/channels/${ids.generalChannel}/messages`), {
      method: 'POST',
      headers: { ...bot, 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: 'hello' }),
    });
    expect(created.status).toBe(200);
    expect(await created.json()).toMatchObject({
      channel_id: ids.generalChannel,
      guild_id: ids.mainGuild,
      content: 'hello',
      author: { id: ids.bot, bot: true },
    });

    const form = new FormData();
    form.append('payload_json', JSON.stringify({ content: 'with file' }));
    form.append('files[0]', new Blob([new Uint8Array([1, 2, 3])]), 'card.png');
    await fetch(api(`/channels/${ids.generalChannel}/messages`), {
      method: 'POST',
      headers: bot,
      body: form,
    });

    const [first, second] = fake.find('POST', `/channels/${ids.generalChannel}/messages`);
    expect(first?.body).toEqual({ content: 'hello' });
    expect(first?.auth).toEqual({ kind: 'bot' });
    expect(second?.body).toEqual({ content: 'with file' });
    expect(second?.files).toEqual([{ field: 'files[0]', filename: 'card.png', size: 3 }]);
  });

  it('keeps an interaction reply as the original message that edits and fetches read', async () => {
    const callback = await fetch(api('/interactions/111/tok-1/callback?with_response=true'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 4, data: { content: 'first' } }),
    });
    expect(await callback.json()).toMatchObject({
      resource: { type: 4, message: { content: 'first' } },
    });

    await fetch(api(`/webhooks/${ids.application}/tok-1/messages/@original`), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: 'edited' }),
    });
    const original = await fetch(api(`/webhooks/${ids.application}/tok-1/messages/@original`));
    expect(await original.json()).toMatchObject({ content: 'edited' });

    const deferred = await fetch(api('/interactions/112/tok-2/callback'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 5 }),
    });
    expect(deferred.status).toBe(204);
  });

  it('serves guild resources and stores command registrations per scope', async () => {
    const roles = (await (
      await fetch(api(`/guilds/${ids.mainGuild}/roles`), { headers: bot })
    ).json()) as Array<{
      id: string;
    }>;
    expect(roles.map((r) => r.id)).toContain(ids.botRole);
    const member = await fetch(api(`/guilds/${ids.mainGuild}/members/${ids.outsider}`), {
      headers: bot,
    });
    expect(member.status).toBe(404);

    const put = await fetch(
      api(`/applications/${ids.application}/guilds/${ids.mainGuild}/commands`),
      {
        method: 'PUT',
        headers: { ...bot, 'Content-Type': 'application/json' },
        body: JSON.stringify([{ name: 'ping', description: 'Ping' }]),
      },
    );
    expect(await put.json()).toMatchObject([{ name: 'ping', guild_id: ids.mainGuild }]);
    const global = await fetch(api(`/applications/${ids.application}/commands`), { headers: bot });
    expect(await global.json()).toEqual([]);
  });

  it('answers 404 for routes it does not implement and lists them as unhandled', async () => {
    const response = await fetch(api('/guilds/1/bans'), { headers: bot });
    expect(response.status).toBe(404);
    expect(fake.unhandled.map((r) => `${r.method} ${r.path}`)).toEqual(['GET /guilds/1/bans']);
    expect(await fetchUnhandledRequests(fake.url)).toHaveLength(1);
  });

  it('waits for a request and reports what it saw on timeout', async () => {
    const waiting = fake.waitFor('POST', /\/typing$/);
    await fetch(api(`/channels/${ids.generalChannel}/typing`), { method: 'POST', headers: bot });
    await expect(waiting).resolves.toMatchObject({ status: 204 });
    await expect(fake.waitFor('DELETE', '/nothing', 20)).rejects.toThrow(/Seen: POST \/channels/);
  });

  it('resets recorded requests and restores the starting fixture', async () => {
    fake.fixture.guilds[0]!.members = [];
    await fetch(api('/users/@me'), { headers: bot });
    fake.reset();
    expect(await fetchRecordedRequests(fake.url)).toEqual([]);
    expect(fake.fixture.guilds[0]?.members).toHaveLength(3);
  });
});
