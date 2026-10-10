import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'node:events';
import { VoiceSessionAccumulator } from '@ririko/services';
import {
  registerVoiceListener,
  trackCurrentVoiceMembers,
  registerMusicVoiceListener,
} from '../voice.listener.js';
import { registerMemberListener } from '../member.listener.js';
import type { BotServices } from '../../services.js';

function voiceState(overrides: Record<string, unknown> = {}) {
  return {
    id: 'user-1',
    channelId: 'voice-1',
    guild: { id: 'guild-1', afkChannelId: null },
    member: { user: { bot: false } },
    selfMute: false,
    selfDeaf: false,
    serverMute: false,
    serverDeaf: false,
    ...overrides,
  };
}

describe('voice listeners (TASK-1254)', () => {
  let client: EventEmitter;
  let accumulator: VoiceSessionAccumulator;
  let services: BotServices;

  beforeEach(() => {
    client = new EventEmitter();
    accumulator = new VoiceSessionAccumulator();
    services = { voiceAccumulator: accumulator } as unknown as BotServices;
  });

  describe('registerVoiceListener', () => {
    it('registers a member who joins a voice channel with their mute and deafen state', () => {
      registerVoiceListener(client as never, services);
      client.emit(
        'voiceStateUpdate',
        voiceState({ channelId: null }),
        voiceState({ selfMute: true, serverDeaf: true }),
      );

      expect(accumulator.getParticipantCount()).toBe(1);
      expect(accumulator.getParticipant('user-1')).toMatchObject({
        channelId: 'voice-1',
        guildId: 'guild-1',
        isBot: false,
        isSelfMuted: true,
        isServerDeafened: true,
        isSelfDeafened: false,
        isServerMuted: false,
      });
    });

    it('moves a member to the new channel and removes them when they leave voice', () => {
      registerVoiceListener(client as never, services);
      client.emit('voiceStateUpdate', voiceState({ channelId: null }), voiceState());
      client.emit('voiceStateUpdate', voiceState(), voiceState({ channelId: 'voice-2' }));
      expect(accumulator.getParticipant('user-1')?.channelId).toBe('voice-2');

      client.emit(
        'voiceStateUpdate',
        voiceState({ channelId: 'voice-2' }),
        voiceState({ channelId: null }),
      );
      expect(accumulator.getParticipantCount()).toBe(0);
    });

    it("marks the guild's AFK channel so it never accrues voice time", () => {
      registerVoiceListener(client as never, services);
      const guild = { id: 'guild-1', afkChannelId: 'afk-1' };
      client.emit(
        'voiceStateUpdate',
        voiceState({ channelId: null, guild }),
        voiceState({ channelId: 'afk-1', guild }),
      );
      expect(accumulator.isAfkChannel('afk-1')).toBe(true);
    });

    it('treats a state without a cached member or mute flags as an unmuted human', () => {
      registerVoiceListener(client as never, services);
      client.emit(
        'voiceStateUpdate',
        voiceState({ channelId: null }),
        voiceState({
          member: null,
          selfMute: undefined,
          selfDeaf: undefined,
          serverMute: undefined,
          serverDeaf: undefined,
        }),
      );
      expect(accumulator.getParticipant('user-1')).toMatchObject({
        isBot: false,
        isSelfMuted: false,
        isSelfDeafened: false,
        isServerMuted: false,
        isServerDeafened: false,
      });
    });
  });

  describe('trackCurrentVoiceMembers', () => {
    it('resets the accumulator and registers everyone already in voice, skipping idle states', () => {
      accumulator.onVoiceStateUpdate({
        userId: 'stale',
        guildId: 'guild-1',
        channelId: 'voice-9',
        isBot: false,
        isSelfMuted: false,
        isSelfDeafened: false,
        isServerMuted: false,
        isServerDeafened: false,
        joinedAt: 1,
      });
      const guild = {
        id: 'guild-1',
        afkChannelId: 'afk-1',
        voiceStates: {
          cache: new Map([
            ['a', voiceState({ id: 'a', channelId: 'voice-1' })],
            ['b', voiceState({ id: 'b', channelId: 'voice-1', member: { user: { bot: true } } })],
            ['c', voiceState({ id: 'c', channelId: null })],
          ]),
        },
      };
      const fakeClient = { guilds: { cache: new Map([['guild-1', guild]]) } };

      trackCurrentVoiceMembers(fakeClient as never, services);

      expect(accumulator.getParticipant('stale')).toBeUndefined();
      expect(accumulator.getParticipant('a')).toBeDefined();
      expect(accumulator.getParticipant('b')?.isBot).toBe(true);
      expect(accumulator.getParticipant('c')).toBeUndefined();
      expect(accumulator.isAfkChannel('afk-1')).toBe(true);
    });

    it('does not mark an AFK channel for a guild without one', () => {
      const guild = { id: 'guild-1', afkChannelId: null, voiceStates: { cache: new Map() } };
      trackCurrentVoiceMembers({ guilds: { cache: new Map([['g', guild]]) } } as never, services);
      expect(accumulator.isAfkChannel('afk-1')).toBe(false);
      expect(accumulator.getParticipantCount()).toBe(0);
    });
  });

  describe('registerMusicVoiceListener', () => {
    let handleChannelOccupancy: ReturnType<typeof vi.fn>;
    let getGuildSettings: ReturnType<typeof vi.fn>;

    function musicServices() {
      handleChannelOccupancy = vi.fn();
      getGuildSettings = vi.fn().mockResolvedValue({ autoLeaveEmpty: false });
      return {
        musicPlayer: { handleChannelOccupancy },
        musicRepo: { getGuildSettings },
      } as unknown as BotServices;
    }

    function guildWithBotIn(
      channelId: string | null,
      members: Array<{ bot: boolean }>,
      voiceBased = true,
    ) {
      const channel = {
        isVoiceBased: () => voiceBased,
        members: {
          filter: (fn: (m: { user: { bot: boolean } }) => boolean) => ({
            size: members.filter((m) => fn({ user: m })).length,
          }),
        },
      };
      return {
        id: 'guild-1',
        members: { me: { voice: { channelId } } },
        channels: { cache: new Map([['voice-1', channel]]) },
      };
    }

    const flush = () => new Promise((r) => setTimeout(r, 5));

    it("reports only the humans in the bot's channel using the guild's auto-leave setting", async () => {
      const svc = musicServices();
      registerMusicVoiceListener(client as never, svc);
      const guild = guildWithBotIn('voice-1', [{ bot: true }, { bot: false }, { bot: false }]);
      client.emit(
        'voiceStateUpdate',
        voiceState({ channelId: 'voice-1', guild }),
        voiceState({ channelId: null, guild }),
      );
      await flush();
      expect(handleChannelOccupancy).toHaveBeenCalledWith('guild-1', 2, false);
    });

    it('defaults auto-leave to on when the guild has no music settings', async () => {
      const svc = musicServices();
      getGuildSettings.mockResolvedValue(null);
      registerMusicVoiceListener(client as never, svc);
      const guild = guildWithBotIn('voice-1', [{ bot: true }]);
      client.emit(
        'voiceStateUpdate',
        voiceState({ channelId: null, guild }),
        voiceState({ channelId: 'voice-1', guild }),
      );
      await flush();
      expect(handleChannelOccupancy).toHaveBeenCalledWith('guild-1', 0, true);
    });

    it('ignores updates when the bot is not in voice or the change is in another channel', async () => {
      const svc = musicServices();
      registerMusicVoiceListener(client as never, svc);
      const noBot = guildWithBotIn(null, []);
      client.emit(
        'voiceStateUpdate',
        voiceState({ channelId: null, guild: noBot }),
        voiceState({ channelId: 'voice-1', guild: noBot }),
      );
      const elsewhere = guildWithBotIn('voice-1', []);
      client.emit(
        'voiceStateUpdate',
        voiceState({ channelId: 'voice-7', guild: elsewhere }),
        voiceState({ channelId: 'voice-8', guild: elsewhere }),
      );
      const notVoice = guildWithBotIn('voice-1', [], false);
      client.emit(
        'voiceStateUpdate',
        voiceState({ channelId: 'voice-1', guild: notVoice }),
        voiceState({ channelId: null, guild: notVoice }),
      );
      await flush();
      expect(handleChannelOccupancy).not.toHaveBeenCalled();
    });

    it('logs and swallows a failure to read the music settings', async () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      const svc = musicServices();
      getGuildSettings.mockRejectedValue(new Error('db down'));
      registerMusicVoiceListener(client as never, svc);
      const guild = guildWithBotIn('voice-1', [{ bot: false }]);
      client.emit(
        'voiceStateUpdate',
        voiceState({ channelId: 'voice-1', guild }),
        voiceState({ channelId: null, guild }),
      );
      await flush();
      expect(handleChannelOccupancy).not.toHaveBeenCalled();
      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('guild-1'), expect.any(Error));
      errorSpy.mockRestore();
    });
  });
});

describe('member listener welcome and farewell cards (TASK-1254)', () => {
  let client: EventEmitter;
  let services: Record<string, any>;
  let send: ReturnType<typeof vi.fn>;
  let logSpy: ReturnType<typeof vi.spyOn>;

  const welcomeConfig = {
    isEnabled: true,
    channelId: 'welcome-1',
    messageTemplate: 'Hi {user}',
    textColor: '#fff',
  };

  function textChannel(onSend = send) {
    return { isTextBased: () => true, send: onSend };
  }

  function member(overrides: Record<string, unknown> = {}) {
    const channels = new Map<string, unknown>([['welcome-1', textChannel()]]);
    return {
      id: 'user-1',
      joinedTimestamp: 1_000,
      user: {
        bot: false,
        username: 'tester',
        tag: 'tester#0001',
        createdTimestamp: 500,
        displayAvatarURL: vi.fn().mockReturnValue('https://cdn/avatar.png'),
      },
      guild: {
        id: 'guild-1',
        name: 'Test Guild',
        memberCount: 7,
        channels: { cache: channels, fetch: vi.fn().mockResolvedValue(null) },
      },
      ...overrides,
    };
  }

  beforeEach(() => {
    client = new EventEmitter();
    send = vi.fn().mockResolvedValue({});
    logSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    services = {
      antiRaidService: {
        handleMemberJoin: vi.fn().mockResolvedValue({ isRaid: false }),
        generateAlertEmbed: vi.fn().mockReturnValue({ title: 'alert' }),
      },
      guildSettingsRepo: { findById: vi.fn().mockResolvedValue({ logChannelId: null }) },
      autoRoleService: { handleMemberJoin: vi.fn().mockResolvedValue(undefined) },
      welcomerRepo: {
        getWelcomeConfig: vi.fn().mockResolvedValue(welcomeConfig),
        getFarewellConfig: vi.fn().mockResolvedValue({ ...welcomeConfig, channelId: 'bye-1' }),
      },
      welcomerService: {
        renderCard: vi.fn().mockResolvedValue(Buffer.from('png')),
        loadBackground: vi.fn().mockResolvedValue('bg'),
      },
    };
    registerMemberListener(client as never, services as unknown as BotServices);
  });

  afterEach(() => {
    logSpy.mockRestore();
    vi.restoreAllMocks();
  });

  const flush = () => new Promise((r) => setTimeout(r, 10));

  it('renders and posts a welcome card with the member and guild details', async () => {
    client.emit('guildMemberAdd', member());
    await flush();

    expect(services.welcomerService.renderCard).toHaveBeenCalledWith(
      expect.objectContaining({
        userTag: 'tester#0001',
        memberCount: 7,
        serverName: 'Test Guild',
        messageText: 'Hi {user}',
        background: 'bg',
        isFarewell: false,
      }),
    );
    const payload = send.mock.calls[0]![0];
    expect(payload.files).toHaveLength(1);
    expect(payload.files[0].name).toBe('welcome.png');
  });

  it('fetches the welcome channel when it is not cached and skips non-text channels', async () => {
    const fetched = member();
    fetched.guild.channels.cache = new Map();
    fetched.guild.channels.fetch = vi.fn().mockResolvedValue(textChannel());
    client.emit('guildMemberAdd', fetched);
    await flush();
    expect(fetched.guild.channels.fetch).toHaveBeenCalledWith('welcome-1');
    expect(send).toHaveBeenCalledTimes(1);

    send.mockClear();
    const voiceOnly = member();
    voiceOnly.guild.channels.cache = new Map([['welcome-1', { isTextBased: () => false, send }]]);
    client.emit('guildMemberAdd', voiceOnly);
    await flush();
    expect(send).not.toHaveBeenCalled();
  });

  it('posts nothing when the welcome message is disabled or has no channel', async () => {
    services.welcomerRepo.getWelcomeConfig.mockResolvedValue({
      ...welcomeConfig,
      isEnabled: false,
    });
    client.emit('guildMemberAdd', member());
    await flush();
    services.welcomerRepo.getWelcomeConfig.mockRejectedValue(new Error('db'));
    client.emit('guildMemberAdd', member());
    await flush();
    expect(services.welcomerService.renderCard).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it('logs a failed welcome send instead of throwing', async () => {
    const failing = member();
    failing.guild.channels.cache = new Map([
      ['welcome-1', textChannel(vi.fn().mockRejectedValue(new Error('missing access')))],
    ]);
    client.emit('guildMemberAdd', failing);
    await flush();
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining('[Welcomer] Failed to send welcome'),
      expect.any(Error),
    );
  });

  it('logs when the anti-raid check itself fails', async () => {
    services.antiRaidService.handleMemberJoin.mockRejectedValue(new Error('boom'));
    client.emit('guildMemberAdd', member());
    await flush();
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining('Error handling guildMemberAdd'),
      expect.any(Error),
    );
    expect(services.welcomerService.renderCard).not.toHaveBeenCalled();
  });

  it('logs a failed join-role assignment and still sends the welcome card', async () => {
    services.autoRoleService.handleMemberJoin.mockRejectedValue(new Error('no perms'));
    client.emit('guildMemberAdd', member());
    await flush();
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining('[AutoRole] Failed to assign join roles'),
      expect.any(Error),
    );
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('fetches the mod-log channel for a raid alert and logs a failed alert send', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    services.antiRaidService.handleMemberJoin.mockResolvedValue({ isRaid: true, reason: 'surge' });
    services.guildSettingsRepo.findById.mockResolvedValue({ logChannelId: 'log-1' });
    const alertSend = vi.fn().mockRejectedValue(new Error('cannot send'));
    const raidMember = member();
    raidMember.guild.channels.fetch = vi.fn().mockResolvedValue({ send: alertSend });
    client.emit('guildMemberAdd', raidMember);
    await flush();

    expect(warn).toHaveBeenCalledWith(expect.stringContaining('surge'));
    expect(alertSend).toHaveBeenCalledWith({ embeds: [{ title: 'alert' }] });
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining('Failed to dispatch raid alert'),
      expect.any(Error),
    );
  });

  it('skips the raid alert when the settings lookup fails or no log channel is set', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    services.antiRaidService.handleMemberJoin.mockResolvedValue({ isRaid: true, reason: 'surge' });
    services.guildSettingsRepo.findById.mockRejectedValue(new Error('db'));
    client.emit('guildMemberAdd', member());
    await flush();
    expect(services.antiRaidService.generateAlertEmbed).not.toHaveBeenCalled();
  });

  it('posts a farewell card with the leaving member details', async () => {
    const byeSend = vi.fn().mockResolvedValue({});
    const leaving = member();
    leaving.guild.channels.cache = new Map([['bye-1', textChannel(byeSend)]]);
    client.emit('guildMemberRemove', leaving);
    await flush();

    expect(services.welcomerService.renderCard).toHaveBeenCalledWith(
      expect.objectContaining({ userTag: 'tester#0001', isFarewell: true }),
    );
    expect(byeSend.mock.calls[0]![0].files[0].name).toBe('farewell.png');
  });

  it('describes a partial member without a user as Unknown User with the default avatar', async () => {
    const byeSend = vi.fn().mockResolvedValue({});
    const partial = member({ user: null });
    partial.guild.channels.cache = new Map();
    partial.guild.channels.fetch = vi.fn().mockResolvedValue(textChannel(byeSend));
    client.emit('guildMemberRemove', partial);
    await flush();

    expect(services.welcomerService.renderCard).toHaveBeenCalledWith(
      expect.objectContaining({
        userTag: 'Unknown User',
        avatarUrl: 'https://cdn.discordapp.com/embed/avatars/0.png',
      }),
    );
    expect(byeSend).toHaveBeenCalledTimes(1);
  });

  it('falls back to the username when the user has no tag, and logs a failed farewell send', async () => {
    const leaving = member();
    leaving.user.tag = '';
    leaving.guild.channels.cache = new Map([
      ['bye-1', textChannel(vi.fn().mockRejectedValue(new Error('nope')))],
    ]);
    client.emit('guildMemberRemove', leaving);
    await flush();
    expect(services.welcomerService.renderCard).toHaveBeenCalledWith(
      expect.objectContaining({ userTag: 'tester' }),
    );
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining('[Farewell] Failed to send farewell'),
      expect.any(Error),
    );
  });

  it('sends no farewell when it is disabled and logs a renderer failure', async () => {
    services.welcomerRepo.getFarewellConfig.mockResolvedValue({
      ...welcomeConfig,
      isEnabled: false,
    });
    client.emit('guildMemberRemove', member());
    await flush();
    expect(services.welcomerService.renderCard).not.toHaveBeenCalled();

    services.welcomerRepo.getFarewellConfig.mockResolvedValue({
      ...welcomeConfig,
      channelId: 'welcome-1',
    });
    services.welcomerService.renderCard.mockRejectedValue(new Error('canvas'));
    client.emit('guildMemberRemove', member());
    await flush();
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining('Error handling guildMemberRemove'),
      expect.any(Error),
    );
  });

  describe('text message (TASK-1333)', () => {
    const text = 'Welcome {user} ({username}) to {server}! Read #rules. @everyone <@&9>';

    /** A server channel as discord.js caches it: a name, an id and the type checks. */
    function named(id: string, name: string, onSend = send) {
      return { id, name, isTextBased: () => true, isThread: () => false, send: onSend };
    }

    function joining(onSend = send) {
      const joined = member();
      joined.guild.channels.cache = new Map<string, unknown>([
        ['welcome-1', named('welcome-1', 'welcome', onSend)],
        ['rules-1', named('rules-1', 'Rules')],
        ['thread-1', { ...named('thread-1', 'rules'), isThread: () => true }],
      ]);
      return joined;
    }

    it('sends the filled text as the content of the welcome card message', async () => {
      services.welcomerRepo.getWelcomeConfig.mockResolvedValue({
        ...welcomeConfig,
        textMessageEnabled: true,
        textMessage: text,
      });
      client.emit('guildMemberAdd', joining());
      await flush();

      expect(send).toHaveBeenCalledTimes(1);
      const payload = send.mock.calls[0]![0];
      expect(payload.files[0].name).toBe('welcome.png');
      expect(payload.content).toBe(
        'Welcome <@user-1> (tester) to Test Guild! Read <#rules-1>. @everyone <@&9>',
      );
      // Only the joining member may be pinged; @everyone, @here and roles never are.
      expect(payload.allowedMentions).toEqual({ users: ['user-1'] });
    });

    it('sends the farewell text with the plain username and no mentions at all', async () => {
      const byeSend = vi.fn().mockResolvedValue({});
      services.welcomerRepo.getFarewellConfig.mockResolvedValue({
        ...welcomeConfig,
        channelId: 'bye-1',
        textMessageEnabled: true,
        textMessage: 'Bye {user}/{username}, see #rules {memberCount}',
      });
      const leaving = joining();
      leaving.guild.channels.cache.set('bye-1', named('bye-1', 'goodbye', byeSend));
      client.emit('guildMemberRemove', leaving);
      await flush();

      const payload = byeSend.mock.calls[0]![0];
      expect(payload.files[0].name).toBe('farewell.png');
      expect(payload.content).toBe('Bye tester/tester, see <#rules-1> 7');
      expect(payload.allowedMentions).toEqual({ parse: [] });
    });

    it('uses Unknown User in the farewell text when the member is partial', async () => {
      const byeSend = vi.fn().mockResolvedValue({});
      services.welcomerRepo.getFarewellConfig.mockResolvedValue({
        ...welcomeConfig,
        channelId: 'bye-1',
        textMessageEnabled: true,
        textMessage: '{user} left',
      });
      const partial = member({ user: null });
      partial.guild.channels.cache = new Map([['bye-1', named('bye-1', 'goodbye', byeSend)]]);
      client.emit('guildMemberRemove', partial);
      await flush();
      expect(byeSend.mock.calls[0]![0].content).toBe('Unknown User left');
    });

    it('sends the card only, exactly as before, when the text is off or empty', async () => {
      for (const config of [
        { textMessageEnabled: false, textMessage: text },
        { textMessageEnabled: true, textMessage: '   ' },
        {},
      ]) {
        send.mockClear();
        services.welcomerRepo.getWelcomeConfig.mockResolvedValue({ ...welcomeConfig, ...config });
        client.emit('guildMemberAdd', joining());
        await flush();
        expect(send).toHaveBeenCalledTimes(1);
        expect(Object.keys(send.mock.calls[0]![0])).toEqual(['files']);
      }

      const byeSend = vi.fn().mockResolvedValue({});
      services.welcomerRepo.getFarewellConfig.mockResolvedValue({
        ...welcomeConfig,
        channelId: 'bye-1',
        textMessageEnabled: false,
        textMessage: text,
      });
      const leaving = member();
      leaving.guild.channels.cache = new Map([['bye-1', textChannel(byeSend)]]);
      client.emit('guildMemberRemove', leaving);
      await flush();
      expect(Object.keys(byeSend.mock.calls[0]![0])).toEqual(['files']);
    });

    it('sends a text that is only the mention of the new member', async () => {
      services.welcomerRepo.getWelcomeConfig.mockResolvedValue({
        ...welcomeConfig,
        textMessageEnabled: true,
        textMessage: '{user}',
      });
      client.emit('guildMemberAdd', joining());
      await flush();
      expect(send.mock.calls[0]![0].content).toBe('<@user-1>');
    });
  });
});
