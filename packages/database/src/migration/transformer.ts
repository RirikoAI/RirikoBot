import type Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import { parseAiModelChoice, readAiModelChoice } from '@ririko/core';
import { legacyUuid } from './uuid.js';
import type {
  TransformedData,
  LegacyConfiguration,
  LegacyUser,
  LegacyGuild,
  LegacyGuildConfig,
  LegacyUserNote,
  LegacyVoiceChannel,
  LegacyMusicChannel,
  LegacyPlaylist,
  LegacyTrack,
  LegacyStreamSubscription,
  LegacyTwitchStreamer,
  LegacyReactionRole,
  LegacyReminder,
  LegacyFreeGameNotification,
  LegacyItem,
  LegacyItemCategory,
} from './types.js';

/**
 * TypeORM's SQLite driver stores dates as UTC text without a zone (`YYYY-MM-DD HH:MM:SS.SSS`,
 * and `datetime('now')` defaults without the milliseconds). `new Date()` would read that as
 * local time.
 */
const SQLITE_UTC_DATETIME = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(\.\d{1,3})?$/;

export function parseLegacyDate(input: unknown): Date {
  if (!input) return new Date();
  if (input instanceof Date) return input;
  if (typeof input === 'number') return new Date(input);
  if (typeof input === 'string') {
    const iso = SQLITE_UTC_DATETIME.test(input) ? `${input.replace(' ', 'T')}Z` : input;
    const parsed = new Date(iso);
    if (!isNaN(parsed.getTime())) return parsed;
  }
  return new Date();
}

const parseDate = parseLegacyDate;

/** 1.4.0 `/karma server enable|disable` stored `enabled` or `disabled`; the others `true`/`false`. */
function isEnabledValue(value: string): boolean {
  return value === 'true' || value === '1' || value === 'enabled';
}

/**
 * The id 2.0 announces a free game under, so a game 1.4.0 already posted is not posted again.
 * 1.4.0 stored the Epic id (or slug) and the Steam store URL.
 */
function freeGameId(source: string, gameId: string): string {
  const provider = source.toLowerCase();
  if (provider === 'epic') return `epic-${gameId}`;
  const steamApp = provider === 'steam' ? /\/app\/(\d+)/.exec(gameId) : null;
  return steamApp ? `steam-${steamApp[1]}` : gameId;
}

export class LegacyTransformer {
  constructor(private readonly db: Database.Database) {}

  private getTableRows<T>(tableNames: string[]): T[] {
    for (const name of tableNames) {
      try {
        const rows = this.db.prepare(`SELECT * FROM "${name}"`).all() as T[];
        if (rows && rows.length > 0) return rows;
      } catch {
        // Continue checking fallback name
      }
    }
    return [];
  }

  /**
   * Transforms all 17 legacy entities into 2.0.0 normalized schema models.
   */
  transform(): TransformedData {
    const now = new Date();

    const transformed: TransformedData = {
      users: [],
      economyBalances: [],
      economyTransactions: [],
      xpAccounts: [],
      guilds: [],
      guildSettings: [],
      moderationNotes: [],
      musicChannels: [],
      musicSavedPlaylists: [],
      musicPlaylistTracks: [],
      streamSubscriptions: [],
      streamers: [],
      streamEvents: [],
      reactionRoles: [],
      reminders: [],
      freeGameAnnouncements: [],
      economyItemCategories: [],
      economyItems: [],
      autoVoiceConfigs: [],
      guildWelcomers: [],
      guildFarewells: [],
      freeGameChannels: [],
      aiGuildPreferences: [],
      imageGuildSettings: [],
      notices: [],
    };

    // 1. Users, Economy Balances, XP Accounts & Migration Ledger Records
    const legacyUsers = this.getTableRows<LegacyUser>(['user', 'users']);
    for (const u of legacyUsers) {
      if (!u.id) continue;
      const createdAt = parseDate(u.createdAt);
      const updatedAt = parseDate(u.updatedAt);
      const coins = Math.max(0, u.coins ?? 0);
      const karma = u.karma ?? 0;
      const isBlacklisted = Boolean(u.pointsSuspended || u.commandsSuspended);
      const notifyLevelUp = !u.doNotNotifyOnLevelUp;

      // User entity
      transformed.users.push({
        id: u.id,
        username: u.username || `user_${u.id}`,
        displayName: u.displayName ?? null,
        profileBackgroundUrl: u.backgroundImageURL ?? null,
        isBlacklisted,
        warnCount: u.warns ?? 0,
        notifyLevelUp,
        createdAt,
        updatedAt,
      });

      // Economy balance entity
      transformed.economyBalances.push({
        userId: u.id,
        walletBalance: coins,
        bankBalance: 0,
        bankCapacity: 10000,
        netWorth: coins,
        updatedAt,
      });

      // Migration ledger transaction entry
      if (coins > 0) {
        transformed.economyTransactions.push({
          id: randomUUID(),
          userId: u.id,
          guildId: null,
          type: 'MIGRATION_V1',
          amount: coins,
          currency: 'CREDITS',
          balanceBefore: 0,
          balanceAfter: coins,
          source: 'LEGACY_MIGRATION',
          metadata: { legacyKarma: karma, migratedAt: now.toISOString() },
          createdAt,
        });
      }

      // XP account entity
      const level = Math.floor(Math.sqrt(Math.max(0, karma) / 100));
      transformed.xpAccounts.push({
        userId: u.id,
        guildId: 'global',
        xp: karma,
        level,
        karma,
        createdAt,
        updatedAt,
      });
    }

    // 2. Guilds & Default Settings
    const legacyGuilds = this.getTableRows<LegacyGuild>(['guild', 'guilds']);
    const guildSettingsMap = new Map<string, (typeof transformed.guildSettings)[number]>();

    for (const g of legacyGuilds) {
      if (!g.id) continue;
      transformed.guilds.push({
        id: g.id,
        name: g.name || `guild_${g.id}`,
        ownerId: '0', // Will be synchronized when bot fetches guild
        joinedAt: now,
        isActive: true,
        createdAt: now,
        updatedAt: now,
      });

      guildSettingsMap.set(g.id, {
        guildId: g.id,
        prefix: g.prefix || '!',
        locale: 'en-US',
        timezone: 'UTC',
        aiChannelId: null,
        logChannelId: null,
        musicChannelId: null,
        karmaNotificationsEnabled: true,
        createdAt: now,
        updatedAt: now,
      });
    }

    // 3. GuildConfig: key-value pairs, named as the 1.4.0 commands write them (`/welcomer`,
    // `/farewell`, `/karma server`, `/freegames`, `/ai-model`, `/stablediffusion-model`). Each
    // value goes to the table 2.0 reads it from.
    const legacyConfigs = this.getTableRows<LegacyGuildConfig>(['guild_config', 'guild_configs']);
    const configByGuild = new Map<string, Map<string, string>>();
    for (const cfg of legacyConfigs) {
      if (!cfg.guildId || !guildSettingsMap.has(cfg.guildId)) continue;
      const values = configByGuild.get(cfg.guildId) ?? new Map<string, string>();
      values.set(cfg.name, cfg.value);
      configByGuild.set(cfg.guildId, values);
    }

    const freeGameChannelByGuild = new Map<string, string>();
    for (const [guildId, values] of configByGuild) {
      const karma = values.get('karma-notification-enabled');
      const settings = guildSettingsMap.get(guildId);
      if (settings && karma !== undefined) {
        settings.karmaNotificationsEnabled = isEnabledValue(karma);
      }

      // 2.0 needs a channel for a card; without one 1.4.0 could not post it either.
      for (const [prefix, cards] of [
        ['welcomer', transformed.guildWelcomers],
        ['farewell', transformed.guildFarewells],
      ] as const) {
        const channelId = values.get(`${prefix}_channel`);
        if (!channelId) continue;
        const enabled = values.get(`${prefix}_enabled`);
        cards.push({
          guildId,
          channelId,
          backgroundUrl: values.get(`${prefix}_bg`) || null,
          isEnabled: enabled !== undefined && isEnabledValue(enabled),
        });
      }

      const freeGamesChannelId = values.get('freeGamesChannelId');
      if (freeGamesChannelId) {
        freeGameChannelByGuild.set(guildId, freeGamesChannelId);
        transformed.freeGameChannels.push({ guildId, channelId: freeGamesChannelId });
      }

      const aiModel = values.get('ai_model');
      if (aiModel) {
        const choice = parseAiModelChoice(readAiModelChoice(aiModel.replace(/:latest$/, '')));
        if (choice) {
          transformed.aiGuildPreferences.push({
            guildId,
            providerOverride: choice.provider,
            modelOverride: choice.model,
          });
        } else {
          transformed.notices.push(
            `Guild ${guildId} used the AI model "${aiModel}", which 2.0 does not offer; it uses the bot default now. Pick a model with /ai-model.`,
          );
        }
      }

      // 2.0 keeps the Replicate model per bot, not per guild; the guild keeps Replicate.
      if (values.get('stablediffusion_model')) {
        transformed.imageGuildSettings.push({ guildId, defaultProvider: 'replicate' });
      }
    }

    transformed.guildSettings = Array.from(guildSettingsMap.values());

    // 1.4.0 kept API credentials in plain text; 2.0 keeps them only in the encrypted vault.
    const legacyConfiguration = this.getTableRows<LegacyConfiguration>([
      'configuration',
      'configurations',
    ]);
    const credentials = [
      ['twitchClientId', 'Twitch client ID'],
      ['twitchClientSecret', 'Twitch client secret'],
      ['stableDiffusionApiToken', 'Stable Diffusion API token'],
    ] as const;
    const present = credentials
      .filter(([key]) => legacyConfiguration.some((row) => row[key]))
      .map(([, label]) => label);
    if (present.length > 0) {
      transformed.notices.push(
        `Not migrated (1.4.0 stored them in plain text): ${present.join(', ')}. Enter them again in the dashboard.`,
      );
    }

    // 4. UserNotes -> moderation_notes
    const legacyNotes = this.getTableRows<LegacyUserNote>(['user_note', 'user_notes']);
    for (const n of legacyNotes) {
      if (!n.userId || !n.note) continue;
      transformed.moderationNotes.push({
        id: String(n.id || randomUUID()),
        guildId: n.guildId || 'global',
        targetUserId: n.userId,
        authorUserId: n.createdBy || 'unknown',
        content: n.note,
        createdAt: parseDate(n.createdAt),
        updatedAt: parseDate(n.updatedAt),
      });
    }

    // 5. VoiceChannel -> auto_voice_configs
    const legacyVoice = this.getTableRows<LegacyVoiceChannel>(['voice_channel', 'voice_channels']);
    for (const vc of legacyVoice) {
      if (!vc.id || !vc.guildId) continue;
      transformed.autoVoiceConfigs.push({
        id: String(vc.id),
        guildId: vc.guildId,
        parentChannelId: vc.parentId || vc.id,
        channelNameTemplate: "{user}'s Room",
        userLimit: 0,
        bitrate: 64000,
      });
    }

    // 6. MusicChannel -> music_channels
    const legacyMusic = this.getTableRows<LegacyMusicChannel>(['music_channel', 'music_channels']);
    for (const mc of legacyMusic) {
      if (!mc.id || !mc.guildId) continue;
      transformed.musicChannels.push({
        guildId: mc.guildId,
        channelId: mc.id,
        lastMessageId: null,
      });
    }

    // 7. Playlist & Tracks -> music_saved_playlists, music_playlist_tracks
    const legacyPlaylists = this.getTableRows<LegacyPlaylist>(['playlist', 'playlists']);
    for (const pl of legacyPlaylists) {
      if (!pl.id || !pl.name) continue;
      const plId = String(pl.id);
      transformed.musicSavedPlaylists.push({
        id: plId,
        userId: pl.userId || 'system',
        name: pl.name,
        description: pl.authorTag ? `Created by ${pl.authorTag}` : null,
        isPublic: Boolean(pl.public),
        playCount: pl.plays ?? 0,
        // 1.4.0 playlists belonged to a user, not a guild.
        guildId: null,
        createdAt: parseDate(pl.createdAt),
      });
    }

    // 1.4.0 kept a playlist's tracks in insertion order (no position column).
    const legacyTracks = this.getTableRows<LegacyTrack>(['track', 'tracks']).sort(
      (a, b) => Number(a.id) - Number(b.id),
    );
    const nextPosition = new Map<string, number>();
    for (const tr of legacyTracks) {
      if (!tr.id || !tr.name || !tr.url || tr.playlistId == null) continue;
      const playlistId = String(tr.playlistId);
      const position = nextPosition.get(playlistId) ?? 0;
      nextPosition.set(playlistId, position + 1);
      transformed.musicPlaylistTracks.push({
        id: String(tr.id),
        playlistId,
        title: tr.name,
        url: tr.url,
        duration: 0,
        thumbnailUrl: null,
        position,
      });
    }

    // 8. StreamSubscription & StreamNotification & TwitchStreamer
    const legacySubs = this.getTableRows<LegacyStreamSubscription>([
      'stream_subscription',
      'stream_subscriptions',
    ]);
    for (const sub of legacySubs) {
      if (!sub.id || !sub.twitchUserId || !sub.guildId) continue;
      // 2.0 stream IDs are uuids on Postgres; derive them so re-runs give the same rows.
      transformed.streamSubscriptions.push({
        id: legacyUuid(`stream_subscription:${sub.id}`),
        streamerId: legacyUuid(`twitch_streamer:${sub.twitchUserId}`),
        guildId: sub.guildId,
        channelId: sub.channelId,
        customMessage: null,
        mentionRoleId: null,
        createdAt: parseDate(sub.createdAt),
      });
    }

    const legacyStreamers = this.getTableRows<LegacyTwitchStreamer>([
      'twitch_streamer',
      'twitch_streamers',
    ]);
    for (const s of legacyStreamers) {
      if (!s.twitchUserId) continue;
      transformed.streamers.push({
        id: legacyUuid(`twitch_streamer:${s.twitchUserId}`),
        platform: 'TWITCH',
        platformUserId: s.twitchUserId,
        username: s.twitchUserId,
        displayName: s.twitchUserId,
        avatarUrl: null,
        isLive: Boolean(s.isLive),
        lastCheckedAt: parseDate(s.updatedAt),
      });
    }

    // 9. ReactionRole -> reaction_roles
    const legacyRRs = this.getTableRows<LegacyReactionRole>(['reaction_role', 'reaction_roles']);
    for (const rr of legacyRRs) {
      if (!rr.id || !rr.guildId || !rr.messageId || !rr.emoji || !rr.roleId) continue;
      transformed.reactionRoles.push({
        id: String(rr.id),
        guildId: rr.guildId,
        channelId: rr.guildId, // In 1.4.0 channelId was implied by guild message lookup
        messageId: rr.messageId,
        emojiOrComponentId: rr.emoji,
        roleId: rr.roleId,
      });
    }

    // 10. Reminder -> reminders
    const legacyReminders = this.getTableRows<LegacyReminder>(['reminder', 'reminders']);
    for (const rem of legacyReminders) {
      if (!rem.id || !rem.userId || !rem.message) continue;
      transformed.reminders.push({
        id: rem.id,
        userId: rem.userId,
        // 1.4.0 stored the literal 'DM' for reminders set in direct messages.
        guildId: rem.guildId && rem.guildId !== 'DM' ? rem.guildId : null,
        channelId: rem.channelId,
        message: rem.message,
        triggerAt: parseDate(rem.scheduledTime),
        repeatInterval: 'NONE',
        isCompleted: Boolean(rem.sent),
      });
    }

    // 11. FreeGameNotification -> free_game_announcements
    const legacyGames = this.getTableRows<LegacyFreeGameNotification>([
      'free_game_notification',
      'free_game_notifications',
    ]);
    for (const fg of legacyGames) {
      const channelId = fg.guildId ? freeGameChannelByGuild.get(fg.guildId) : undefined;
      if (!fg.gameId || !fg.guildId || !channelId) continue;
      transformed.freeGameAnnouncements.push({
        gameId: freeGameId(fg.source, fg.gameId),
        guildId: fg.guildId,
        channelId,
        messageId: 'legacy_migrated',
        announcedAt: parseDate(fg.createdAt),
      });
    }

    // 12. ItemCategory & Item -> economy_item_categories, economy_items
    const legacyCategories = this.getTableRows<LegacyItemCategory>([
      'item_category',
      'item_categories',
    ]);
    for (const cat of legacyCategories) {
      if (!cat.id || !cat.name) continue;
      transformed.economyItemCategories.push({
        id: String(cat.id),
        name: cat.name,
        description: cat.name,
      });
    }

    const legacyItems = this.getTableRows<LegacyItem>(['item', 'items']);
    for (const item of legacyItems) {
      if (!item.id || !item.name) continue;
      transformed.economyItems.push({
        id: String(item.id),
        name: item.name,
        description: item.description || item.name,
        price: item.price ?? 0,
        rarity: 'COMMON',
        categoryId: item.categoryId ? String(item.categoryId) : null,
        iconUrl: item.imageUrl || null,
        // SQLite booleans arrive as 0 or 1.
        isPurchasable: Boolean(item.purchasable),
        metadata: {
          findable: Boolean(item.findable),
          sellable: Boolean(item.sellable),
          hidden: Boolean(item.hidden),
          purchaseLimit: item.purchaseLimit ?? 0,
          legacyRarity: item.rarity ?? null,
        },
      });
    }

    return transformed;
  }
}
