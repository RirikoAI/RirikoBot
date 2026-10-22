/**
 * What the departed-server purge (TASK-1935, STORY-193) does with every table that has a
 * `guild_id` column. `guilds` has no foreign keys from other tables, so nothing cascades: a table
 * missing from this list would keep a deleted server's data forever. The test
 * `guild-data-inventory.test.ts` reads both Drizzle schemas and fails when a table with a
 * `guild_id` column is not listed here, or a listed table or column no longer exists.
 *
 * Add a table here in the same change that gives it a `guild_id` column, and say in `note` why
 * the action is right. Change an action only together with `docs/legal/privacy.md`.
 */

/**
 * - `delete`: the rows belong to the server; the purge deletes the ones with this `guild_id`.
 * - `detach`: the rows belong to a user and only record the server they were made in (`guild_id`
 *   is nullable); the purge keeps them and sets `guild_id` to null.
 * - `exclude`: the column is not a Discord server id; the purge leaves the table alone.
 */
export type GuildDataAction = 'delete' | 'detach' | 'exclude';

export interface GuildDataEntry {
  /** SQL table name, the same on both dialects. */
  readonly table: string;
  readonly action: GuildDataAction;
  /** Why this action is right, for the reader of the inventory. */
  readonly note?: string;
}

/**
 * A table with no `guild_id` column whose rows belong to a row of an inventoried table. The purge
 * deletes these first, through `parentTable`, while the parent rows still exist.
 */
export interface GuildChildEntry {
  readonly table: string;
  /** The column that holds the parent's id. */
  readonly column: string;
  readonly parentTable: string;
  readonly parentColumn: string;
}

/** The column every inventoried table keeps the server id in. */
export const GUILD_ID_COLUMN = 'guild_id';

/** Every table with a `guild_id` column (43 tables, both dialects). Sorted by table name. */
export const GUILD_DATA_INVENTORY: readonly GuildDataEntry[] = [
  { table: 'adventure_sessions', action: 'delete' },
  { table: 'adventure_settings', action: 'delete' },
  { table: 'ai_channels', action: 'delete' },
  {
    table: 'ai_conversations',
    action: 'delete',
    note: 'guild_id is null for DMs, which stay. A server conversation is chat from that server; its messages go first (ai_messages).',
  },
  { table: 'ai_guild_preferences', action: 'delete' },
  {
    table: 'audit_logs',
    action: 'delete',
    note: 'guild_id is null for owner console entries, which stay. Entries about the server go with it.',
  },
  { table: 'auto_voice_channels', action: 'delete' },
  { table: 'auto_voice_configs', action: 'delete' },
  { table: 'command_settings', action: 'delete' },
  { table: 'command_usage_daily', action: 'delete' },
  {
    table: 'economy_transactions',
    action: 'detach',
    note: 'The ledger of a user balance. Deleting rows would stop it adding up to economy_balances, so only the server link is removed.',
  },
  { table: 'event_log_settings', action: 'delete' },
  { table: 'free_game_announcements', action: 'delete' },
  { table: 'free_game_channels', action: 'delete' },
  { table: 'game_sessions', action: 'delete' },
  { table: 'giveaways', action: 'delete', note: 'Entries and winners go first.' },
  { table: 'guild_auto_roles', action: 'delete' },
  { table: 'guild_config_versions', action: 'delete' },
  { table: 'guild_farewell', action: 'delete' },
  { table: 'guild_members', action: 'delete' },
  { table: 'guild_settings', action: 'delete' },
  { table: 'guild_voice_activity', action: 'delete' },
  { table: 'guild_welcomer', action: 'delete' },
  { table: 'image_guild_settings', action: 'delete' },
  {
    table: 'image_jobs',
    action: 'delete',
    note: 'guild_id is null for DMs, which stay. Prompts made in the server go with it.',
  },
  { table: 'leaderboard_snapshots', action: 'delete' },
  { table: 'level_role_settings', action: 'delete' },
  { table: 'moderation_cases', action: 'delete' },
  { table: 'moderation_notes', action: 'delete' },
  { table: 'moderation_rules', action: 'delete' },
  { table: 'moderation_warnings', action: 'delete' },
  { table: 'music_channels', action: 'delete' },
  { table: 'music_guild_settings', action: 'delete' },
  { table: 'music_history', action: 'delete' },
  {
    table: 'music_saved_playlists',
    action: 'detach',
    note: "A user's playlist (listed by user, can be public). Its tracks stay with it; only the server link is removed.",
  },
  { table: 'reaction_roles', action: 'delete' },
  {
    table: 'reminders',
    action: 'detach',
    note: "A user's reminder. It is sent by DM first, so it still works after the bot leaves; only the server link (used for the time zone) is removed.",
  },
  { table: 'starboard_posts', action: 'delete' },
  { table: 'starboard_settings', action: 'delete' },
  { table: 'stream_announcements', action: 'delete' },
  { table: 'stream_subscriptions', action: 'delete' },
  { table: 'temporary_roles', action: 'delete' },
  { table: 'ticket_settings', action: 'delete' },
  {
    table: 'tickets',
    action: 'delete',
    note: 'Ticket metadata only. Transcripts are posted to a channel in the server and are never stored.',
  },
  {
    table: 'waifu_guild_members',
    action: 'exclude',
    note: 'guild_id is the id of a WaifuGuild (a trading card guild inside the bot), not a Discord server.',
  },
  { table: 'xp_accounts', action: 'delete' },
  { table: 'xp_events', action: 'delete' },
];

/** Tables that hold no server id themselves but belong to rows of an inventoried table. */
export const GUILD_CHILD_DATA: readonly GuildChildEntry[] = [
  {
    table: 'adventure_choices',
    column: 'session_id',
    parentTable: 'adventure_sessions',
    parentColumn: 'id',
  },
  {
    table: 'ai_messages',
    column: 'conversation_id',
    parentTable: 'ai_conversations',
    parentColumn: 'id',
  },
  {
    table: 'giveaway_entries',
    column: 'giveaway_id',
    parentTable: 'giveaways',
    parentColumn: 'id',
  },
  {
    table: 'giveaway_winners',
    column: 'giveaway_id',
    parentTable: 'giveaways',
    parentColumn: 'id',
  },
];
