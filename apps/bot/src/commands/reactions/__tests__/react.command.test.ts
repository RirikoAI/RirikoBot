import { describe, it, expect, vi } from 'vitest';
import type { CommandContext } from '@ririko/discord';
import { REACTION_NAMES } from '@ririko/services';
import { createReactCommand } from '../react.command.js';
import type { BotServices } from '../../../services.js';

const INVOKER = { id: '111111111111111111', username: 'Invoker', displayAvatarURL: () => 'https://cdn/avatar-1.png' };
const TARGET = { id: '222222222222222222', username: 'Target', displayAvatarURL: () => 'https://cdn/avatar-2.png' };

function makeClient(users: Record<string, { id: string }>) {
  return {
    users: {
      cache: new Map(Object.values(users).map((u) => [u.id, u])),
      fetch: vi.fn(async (id: string) => {
        const found = Object.values(users).find((u) => u.id === id);
        if (!found) throw new Error('not found');
        return found;
      }),
    },
  };
}

interface FakeCtxOptions {
  source: 'slash' | 'prefix';
  invokedName: string;
  invokedPrefix?: string;
  rawArgs?: string[];
  slashType?: string | null;
  slashTargetUser?: { id: string } | null;
  guildId?: string | null;
}

function makeCtx(opts: FakeCtxOptions) {
  const reply = vi.fn().mockResolvedValue(undefined);
  const client = makeClient({ [INVOKER.id]: INVOKER, [TARGET.id]: TARGET });
  const ctx = {
    source: opts.source,
    invokedName: opts.invokedName,
    invokedPrefix: opts.invokedPrefix ?? (opts.source === 'slash' ? '/' : '!'),
    user: INVOKER,
    guildId: opts.guildId ?? null,
    client,
    options: {
      getString: vi.fn().mockReturnValue(opts.slashType ?? null),
      getUser: vi.fn().mockResolvedValue(opts.slashTargetUser ?? null),
      getRawArgs: vi.fn().mockReturnValue(opts.rawArgs ?? []),
    },
    reply,
  };
  return { ctx: ctx as unknown as CommandContext, reply };
}

function servicesWith(getGifUrl: ReturnType<typeof vi.fn>): BotServices {
  return {
    reactionGifService: { getGifUrl },
    guildSettingsService: { getPrefix: vi.fn().mockResolvedValue('!') },
  } as unknown as BotServices;
}

describe('/react (TASK-1302)', () => {
  it('replies with the legacy target phrasing and the fetched gif when a distinct target is mentioned', async () => {
    const getGifUrl = vi.fn().mockResolvedValue({ url: 'https://otakugifs.xyz/hug.gif', stale: false });
    const { ctx, reply } = makeCtx({
      source: 'slash',
      invokedName: 'react',
      slashType: 'hug',
      slashTargetUser: TARGET,
    });

    await createReactCommand(servicesWith(getGifUrl)).execute(ctx);

    expect(getGifUrl).toHaveBeenCalledWith('hug');
    const payload = reply.mock.calls[0]![0];
    expect(payload.content).toBe(`<@${INVOKER.id}> wrapped themselves in a warm hug with <@${TARGET.id}>`);
    expect(payload.embeds[0].data.image.url).toBe('https://otakugifs.xyz/hug.gif');
    expect(payload.embeds[0].data.footer).toEqual({ text: 'Requested by Invoker', icon_url: 'https://cdn/avatar-1.png' });
  });

  it('replies with the legacy self-directed phrasing when no target is mentioned', async () => {
    const getGifUrl = vi.fn().mockResolvedValue({ url: 'https://otakugifs.xyz/hug.gif', stale: false });
    const { ctx, reply } = makeCtx({ source: 'slash', invokedName: 'react', slashType: 'hug', slashTargetUser: null });

    await createReactCommand(servicesWith(getGifUrl)).execute(ctx);

    expect(reply.mock.calls[0]![0].content).toBe(`<@${INVOKER.id}> wrapped themselves in a warm, self-comforting hug`);
  });

  it('treats a self-mention exactly like no target', async () => {
    const getGifUrl = vi.fn().mockResolvedValue({ url: 'https://otakugifs.xyz/hug.gif', stale: false });
    const { ctx, reply } = makeCtx({ source: 'slash', invokedName: 'react', slashType: 'hug', slashTargetUser: INVOKER });

    await createReactCommand(servicesWith(getGifUrl)).execute(ctx);

    expect(reply.mock.calls[0]![0].content).toBe(`<@${INVOKER.id}> wrapped themselves in a warm, self-comforting hug`);
  });

  it('renders the legacy "use your imagination" embed when no gif is available', async () => {
    const getGifUrl = vi.fn().mockResolvedValue(null);
    const { ctx, reply } = makeCtx({ source: 'slash', invokedName: 'react', slashType: 'hug' });

    await createReactCommand(servicesWith(getGifUrl)).execute(ctx);

    const embed = reply.mock.calls[0]![0].embeds[0].data;
    expect(embed.description).toBe("Error fetching the image.\nYou'll have to use your imagination for this one!");
    expect(embed.image).toBeUndefined();
  });

  it('dispatches canonical prefix invocation: !react <type> [@target]', async () => {
    const getGifUrl = vi.fn().mockResolvedValue({ url: 'https://otakugifs.xyz/poke.gif', stale: false });
    const { ctx, reply } = makeCtx({
      source: 'prefix',
      invokedName: 'react',
      rawArgs: ['poke', `<@${TARGET.id}>`],
    });

    await createReactCommand(servicesWith(getGifUrl)).execute(ctx);

    expect(getGifUrl).toHaveBeenCalledWith('poke');
    expect(reply.mock.calls[0]![0].content).toContain(`<@${TARGET.id}>`);
  });

  it('dispatches a legacy alias invocation using ctx.invokedName as the reaction (!hug @user)', async () => {
    const getGifUrl = vi.fn().mockResolvedValue({ url: 'https://otakugifs.xyz/hug.gif', stale: false });
    const { ctx, reply } = makeCtx({
      source: 'prefix',
      invokedName: 'hug',
      rawArgs: [`<@${TARGET.id}>`],
    });

    await createReactCommand(servicesWith(getGifUrl)).execute(ctx);

    expect(getGifUrl).toHaveBeenCalledWith('hug');
    expect(reply.mock.calls[0]![0].content).toBe(`<@${INVOKER.id}> wrapped themselves in a warm hug with <@${TARGET.id}>`);
  });

  it('dispatches a bare legacy alias with no target (!poke)', async () => {
    const getGifUrl = vi.fn().mockResolvedValue({ url: 'https://otakugifs.xyz/poke.gif', stale: false });
    const { ctx, reply } = makeCtx({ source: 'prefix', invokedName: 'poke', rawArgs: [] });

    await createReactCommand(servicesWith(getGifUrl)).execute(ctx);

    expect(getGifUrl).toHaveBeenCalledWith('poke');
    expect(reply.mock.calls[0]![0].content).not.toContain('undefined');
  });

  it('rejects an unknown reaction type with a helpful, non-crashing error', async () => {
    const getGifUrl = vi.fn();
    const { ctx, reply } = makeCtx({ source: 'slash', invokedName: 'react', slashType: 'not-a-reaction' });

    await createReactCommand(servicesWith(getGifUrl)).execute(ctx);

    expect(getGifUrl).not.toHaveBeenCalled();
    const payload = reply.mock.calls[0]![0];
    expect(payload.content).toMatch(/not-a-reaction/);
    expect(payload.content).toMatch(/react type:/);
    expect(payload.ephemeral).toBe(true);
  });

  it('rejects a missing reaction type on bare !react', async () => {
    const getGifUrl = vi.fn();
    const { ctx, reply } = makeCtx({ source: 'prefix', invokedName: 'react', rawArgs: [] });

    await createReactCommand(servicesWith(getGifUrl)).execute(ctx);

    expect(getGifUrl).not.toHaveBeenCalled();
    expect(reply.mock.calls[0]![0].content).toMatch(/Please tell me which reaction/);
  });

  it('registers exactly the 68 catalog reaction names minus the one dice/roll collision as aliases', () => {
    const command = createReactCommand(servicesWith(vi.fn()));
    expect(command.metadata.aliases).toHaveLength(REACTION_NAMES.length - 1);
    expect(command.metadata.aliases).not.toContain('roll');
    expect(command.metadata.aliases).toContain('hug');
    expect(command.metadata.aliases).toContain('stopit');
  });

  it('autocomplete returns catalog matches capped at 25 with {name, value} shape', async () => {
    const command = createReactCommand(servicesWith(vi.fn()));
    const respond = vi.fn().mockResolvedValue(undefined);
    const interaction = { options: { getFocused: () => '' }, respond } as unknown as Parameters<
      NonNullable<typeof command.autocomplete>
    >[0];

    await command.autocomplete!(interaction);

    expect(respond).toHaveBeenCalledTimes(1);
    const results = respond.mock.calls[0]![0] as Array<{ name: string; value: string }>;
    expect(results.length).toBeLessThanOrEqual(25);
    for (const r of results) {
      expect(typeof r.name).toBe('string');
      expect(typeof r.value).toBe('string');
      expect(r.name.length).toBeLessThanOrEqual(100);
    }
  });

  it('autocomplete filters by the focused query and returns the catalog name as value', async () => {
    const command = createReactCommand(servicesWith(vi.fn()));
    const respond = vi.fn().mockResolvedValue(undefined);
    const interaction = { options: { getFocused: () => 'hu' }, respond } as unknown as Parameters<
      NonNullable<typeof command.autocomplete>
    >[0];

    await command.autocomplete!(interaction);

    const results = respond.mock.calls[0]![0] as Array<{ name: string; value: string }>;
    expect(results.some((r) => r.value === 'hug')).toBe(true);
    expect(results.every((r) => r.name.toLowerCase().includes('hu') || r.value.toLowerCase().includes('hu'))).toBe(
      true,
    );
  });
});
