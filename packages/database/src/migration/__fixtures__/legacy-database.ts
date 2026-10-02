import DatabaseConstructor from 'better-sqlite3';
import type Database from 'better-sqlite3';
import { readFileSync } from 'node:fs';

/** How TypeORM's SQLite driver writes a Date: UTC, no zone. */
export const ALICE_CREATED = '2025-03-04 05:06:07.890';
export const REMINDER_DUE = '2025-03-04 05:06:07.890';

/** Schema of a real 1.4.0 database, taken from the published image (see the file header). */
export function legacySchema(): string {
  return readFileSync(new URL('./legacy-1.4.0-schema.sql', import.meta.url), 'utf8');
}

/**
 * Writes a 1.4.0 database at `path`: the real schema plus rows for every table the migration
 * reads, in the formats 1.4.0 wrote them. Three users hold 1800 coins and 300 karma.
 */
export function createLegacyDatabase(path: string): void {
  const db: Database.Database = new (DatabaseConstructor as unknown as typeof Database)(path);
  // 1.4.0 ran with foreign keys on (TypeORM sets the pragma), so rows must reference real parents.
  db.pragma('foreign_keys = ON');
  db.exec(legacySchema());

  db.exec(`
    INSERT INTO "user" (id, username, displayName, karma, coins, pointsSuspended, commandsSuspended, doNotNotifyOnLevelUp, warns, createdAt, updatedAt, backgroundImageURL) VALUES
      ('user_alice', 'Alice', 'Alice Wonderland', 250, 1500, 0, 0, 0, 1, '${ALICE_CREATED}', '${ALICE_CREATED}', 'https://bg.jpg');
    -- createdAt and updatedAt from the column defaults, as TypeORM leaves them.
    INSERT INTO "user" (id, username, displayName, karma, coins, doNotNotifyOnLevelUp) VALUES
      ('user_bob', 'Bob', 'Builder Bob', 50, 300, 1);
    INSERT INTO "user" (id, username, displayName, pointsSuspended, warns) VALUES
      ('user_charlie', 'Charlie', 'Banned Charlie', 1, 5);

    INSERT INTO guild (id, name, prefix) VALUES
      ('guild_alpha', 'Alpha Server', '!'),
      ('guild_beta', 'Beta Server', '?');

    -- Names and values as the 1.4.0 /welcomer, /farewell, /karma, /freegames and /twitch commands write them.
    INSERT INTO guild_config (name, value, guildId) VALUES
      ('welcomer_channel', 'chan_welcome', 'guild_alpha'),
      ('welcomer_enabled', 'true', 'guild_alpha'),
      ('welcomer_bg', 'https://welcome.png', 'guild_alpha'),
      ('farewell_channel', 'chan_bye', 'guild_alpha'),
      ('farewell_enabled', 'false', 'guild_alpha'),
      ('karma-notification-enabled', 'disabled', 'guild_beta'),
      ('freeGamesChannelId', 'chan_free', 'guild_alpha'),
      ('twitch_channel', 'chan_streams', 'guild_alpha');

    INSERT INTO configuration (applicationId, twitchClientId, twitchClientSecret) VALUES
      ('100000000000000001', 'twitch-client', 'twitch-secret');

    INSERT INTO user_note (note, createdBy, guildId, userId) VALUES
      ('Helpful contributor', 'user_alice', 'guild_alpha', 'user_bob');

    INSERT INTO voice_channel (id, name, parentId, guildId) VALUES
      ('vc_main', 'Join to Create', 'cat_voice', 'guild_alpha');

    INSERT INTO music_channel (id, name, guildId) VALUES
      ('chan_music', 'music-room', 'guild_alpha');

    INSERT INTO playlist (id, name, userId, author, authorTag, public, plays) VALUES
      (1, 'Favorites', 'user_alice', 'Alice', 'alice', 1, 42),
      (2, 'Chill', 'user_bob', 'Bob', 'bob', 0, 3);

    -- Interleaved ids: each playlist keeps its own order.
    INSERT INTO track (id, name, url, playlistId) VALUES
      (10, 'Song 1', 'https://youtube.com/watch?v=1', 1),
      (11, 'Calm 1', 'https://youtube.com/watch?v=3', 2),
      (12, 'Song 2', 'https://youtube.com/watch?v=2', 1);

    INSERT INTO stream_subscription (twitchUserId, channelId, guildId) VALUES
      ('twitch_streamer_1', 'chan_streams', 'guild_alpha');

    INSERT INTO stream_notification (twitchUserId, channelId, streamId, notified, guildId) VALUES
      ('twitch_streamer_1', 'chan_streams', 'stream_1', 1, 'guild_alpha');

    INSERT INTO twitch_streamer (twitchUserId, isLive) VALUES
      ('twitch_streamer_1', 1);

    INSERT INTO reaction_role (messageId, emoji, roleId, guildId) VALUES
      ('msg_roles', '⭐', 'role_vip', 'guild_alpha');

    -- 1.4.0 stored the literal 'DM' as the guild of direct-message reminders.
    INSERT INTO reminder (id, userId, channelId, guildId, message, scheduledTime, sent) VALUES
      ('rem_1', 'user_alice', 'chan_general', 'guild_alpha', 'Meeting in 1h', '${REMINDER_DUE}', 0),
      ('rem_2', 'user_alice', 'dm_channel', 'DM', 'Water plants', '2025-03-05 00:00:00', 1);

    INSERT INTO free_game_notification (gameId, gameName, source, notified, guildId) VALUES
      ('epic_game_99', 'Awesome Free Game', 'EPIC', 1, 'guild_alpha');

    INSERT INTO item_category (id, name) VALUES (1, 'Roles');

    INSERT INTO item (id, name, price, description, rarity, hidden, purchaseLimit, purchasable, sellable, findable, imageUrl, categoryId) VALUES
      (1, 'VIP Pass', 500, 'Grants VIP role', 2, 0, 1, 1, 0, 0, 'https://vip.png', 1),
      (2, 'Secret Badge', 0, 'Found, never sold', 5, 1, 0, 0, 0, 1, '', NULL);
  `);

  db.close();
}
