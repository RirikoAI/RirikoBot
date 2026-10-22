import { createHash } from 'node:crypto';

/**
 * What `ririko user erase` does to one column that can hold a Discord user ID (TASK-1941,
 * STORY-194). Every table with such a column is listed here, once per column, with the action
 * and the reason. `user-data-inventory.test.ts` fails when a column of either schema that looks
 * like a user ID (see `USER_ID_COLUMN_PATTERN`) is missing, so a new table cannot ship without an
 * erasure decision.
 *
 * - `delete`: the rows belong only to the user. They are deleted.
 * - `tombstone`: the row is shared with other people (a ledger entry, a trade, a case where the
 *   user is the moderator). The row stays and the ID is replaced by `erasedMarker(userId)`.
 * - `keep`: the column does not hold a Discord user ID, or the row must stay for a stated reason.
 *   Nothing changes.
 */
export type UserDataAction = 'delete' | 'tombstone' | 'keep';

/** Options that switch on rows the command leaves alone by default. */
export type UserDataOptIn = 'moderation';

export interface UserDataEntry {
  /** SQL table name, the same on both dialects. */
  readonly table: string;
  /** SQL column name that holds the user ID. */
  readonly column: string;
  readonly action: UserDataAction;
  /**
   * The action applies only when this option is on (`--include-moderation`). Without it the rows
   * are reported as kept and nothing changes.
   */
  readonly optIn?: UserDataOptIn;
  /** `tombstone` only: columns set to NULL on the same rows (IP address, browser name). */
  readonly clear?: readonly string[];
  /**
   * `tombstone` only: the rows are deleted instead when no other user has a row in `table`
   * pointing at them (a guild the user leads alone).
   */
  readonly deleteWhenAlone?: {
    readonly table: string;
    readonly column: string;
    readonly userColumn: string;
    readonly parentColumn: string;
  };
  /** Why this action is right, for the reader of the inventory. Required unless it is a plain delete. */
  readonly note?: string;
}

/** A table without a user column whose rows belong to a row of an inventoried `delete` table. */
export interface UserChildEntry {
  readonly table: string;
  /** The column that holds the parent's id. */
  readonly column: string;
  readonly parentTable: string;
  readonly parentColumn: string;
  /** The user column of the parent, which selects the parent rows. */
  readonly parentUserColumn: string;
}

/** A JSON column that can hold a user ID in a value or a key. Replaced as text on both dialects. */
export interface UserTextEntry {
  readonly table: string;
  readonly column: string;
  readonly optIn?: UserDataOptIn;
  readonly note: string;
}

/**
 * Columns of the schema that are expected to hold a user ID. A column whose name ends like this
 * and is not in `USER_DATA_INVENTORY` fails the guard test.
 */
export const USER_ID_COLUMN_PATTERN = /(user_id|_by|_by_id|owner_id|moderator_id)$/;

/** The start of every tombstone. A column holding it holds no Discord user ID. */
export const TOMBSTONE_PREFIX = 'erased:';

/** Hex digits of the SHA-256 of the user ID that name a user in a tombstone and in the audit entry. */
export const USER_HASH_LENGTH = 16;

/** The first `USER_HASH_LENGTH` hex digits of the SHA-256 of the user ID. */
export function userHash(userId: string): string {
  return createHash('sha256').update(userId).digest('hex').slice(0, USER_HASH_LENGTH);
}

/** What replaces the user ID in a shared row: `erased:<sha256 prefix>` (23 characters). */
export function erasedMarker(userId: string): string {
  return `${TOMBSTONE_PREFIX}${userHash(userId)}`;
}

const MODERATION_NOTE =
  'A staff record of the server. Kept unless the host runs the command with --include-moderation.';

/** Every column that can hold a Discord user ID (both dialects). Sorted by table, then column. */
export const USER_DATA_INVENTORY: readonly UserDataEntry[] = [
  { table: 'adventure_players', column: 'user_id', action: 'delete' },
  { table: 'adventure_sessions', column: 'user_id', action: 'delete' },
  { table: 'ai_conversations', column: 'user_id', action: 'delete' },
  { table: 'ai_user_preferences', column: 'user_id', action: 'delete' },
  {
    table: 'audit_logs',
    column: 'actor_user_id',
    action: 'tombstone',
    clear: ['ip_address', 'user_agent'],
    note: 'An entry about a change somebody made stays for the server and the host. The actor ID, the IP address and the browser name go.',
  },
  { table: 'boss_runs', column: 'user_id', action: 'delete' },
  {
    table: 'card_trades',
    column: 'receiver_user_id',
    action: 'tombstone',
    note: 'The other party keeps the trade in their history. Pending trades are cancelled first and the cards of the other party are unlocked.',
  },
  {
    table: 'card_trades',
    column: 'sender_user_id',
    action: 'tombstone',
    note: 'The other party keeps the trade in their history. Pending trades are cancelled first and the cards of the other party are unlocked.',
  },
  { table: 'economy_accounts', column: 'user_id', action: 'delete' },
  { table: 'economy_balances', column: 'user_id', action: 'delete' },
  {
    table: 'economy_config',
    column: 'updated_by',
    action: 'tombstone',
    note: 'Who last changed a global setting. The setting itself is not about the user.',
  },
  { table: 'economy_cooldowns', column: 'user_id', action: 'delete' },
  { table: 'economy_inventories', column: 'user_id', action: 'delete' },
  {
    table: 'economy_transactions',
    column: 'user_id',
    action: 'tombstone',
    note: 'The ledger is double entry: a transfer has a row on each side. Deleting one side would break the balance of the other user, so the row stays without the ID.',
  },
  {
    table: 'game_sessions',
    column: 'host_user_id',
    action: 'tombstone',
    note: 'A game involves other players, so the row stays without the ID.',
  },
  {
    table: 'game_sessions',
    column: 'opponent_user_id',
    action: 'tombstone',
    note: 'A game involves other players, so the row stays without the ID.',
  },
  {
    table: 'game_sessions',
    column: 'winner_user_id',
    action: 'tombstone',
    note: 'A game involves other players, so the row stays without the ID.',
  },
  { table: 'game_statistics', column: 'user_id', action: 'delete' },
  { table: 'giveaway_entries', column: 'user_id', action: 'delete' },
  {
    table: 'giveaway_winners',
    column: 'user_id',
    action: 'tombstone',
    note: 'The giveaway and its other winners stay complete.',
  },
  {
    table: 'giveaways',
    column: 'created_by',
    action: 'tombstone',
    note: 'The giveaway belongs to the server. Only the name of its creator goes.',
  },
  {
    table: 'guild_members',
    column: 'user_id',
    action: 'delete',
  },
  {
    table: 'guilds',
    column: 'invited_by_id',
    action: 'tombstone',
    note: 'Who added the bot to a server. The server row is not about the user.',
  },
  {
    table: 'guilds',
    column: 'owner_id',
    action: 'tombstone',
    note: 'The server row stays. The bot learns the owner again from Discord the next time the server is synced.',
  },
  { table: 'image_jobs', column: 'user_id', action: 'delete' },
  { table: 'image_usage', column: 'user_id', action: 'delete' },
  { table: 'leaderboard_snapshots', column: 'user_id', action: 'delete' },
  { table: 'market_listings', column: 'seller_user_id', action: 'delete' },
  {
    table: 'moderation_cases',
    column: 'moderator_user_id',
    action: 'tombstone',
    note: 'The case is about another person and stays complete.',
  },
  {
    table: 'moderation_cases',
    column: 'target_user_id',
    action: 'tombstone',
    optIn: 'moderation',
    note: MODERATION_NOTE,
  },
  {
    table: 'moderation_notes',
    column: 'author_user_id',
    action: 'tombstone',
    note: 'The note is about another person and stays complete.',
  },
  {
    table: 'moderation_notes',
    column: 'target_user_id',
    action: 'delete',
    optIn: 'moderation',
    note: `${MODERATION_NOTE} A note is text that staff wrote about the user, so it is deleted.`,
  },
  {
    table: 'moderation_warnings',
    column: 'moderator_id',
    action: 'tombstone',
    note: 'The warning is about another person and stays complete.',
  },
  {
    table: 'moderation_warnings',
    column: 'user_id',
    action: 'delete',
    optIn: 'moderation',
    note: MODERATION_NOTE,
  },
  { table: 'music_history', column: 'user_id', action: 'delete' },
  { table: 'music_saved_playlists', column: 'user_id', action: 'delete' },
  { table: 'player_energy', column: 'user_id', action: 'delete' },
  { table: 'reminders', column: 'user_id', action: 'delete' },
  {
    table: 'starboard_posts',
    column: 'author_id',
    action: 'delete',
    note: 'The record of a starred message the member wrote. The copy in the starboard channel is a Discord message and is not part of the bot database.',
  },
  {
    table: 'streamers',
    column: 'platform_user_id',
    action: 'keep',
    note: 'The ID of a streamer on Twitch, YouTube or TikTok, not a Discord user ID. A Discord server follows the streamer, the streamer is not a Discord user of the bot.',
  },
  {
    table: 'tcg_system_configs',
    column: 'updated_by',
    action: 'tombstone',
    note: 'Who last changed a global rule. The rule itself is not about the user.',
  },
  {
    table: 'temporary_roles',
    column: 'assigned_by',
    action: 'tombstone',
    note: 'The role belongs to another member and stays.',
  },
  { table: 'temporary_roles', column: 'user_id', action: 'delete' },
  {
    table: 'tickets',
    column: 'claimed_by',
    action: 'tombstone',
    note: 'The ticket belongs to the member who opened it. The staff member who claimed it is only named.',
  },
  {
    table: 'tickets',
    column: 'closed_by',
    action: 'tombstone',
    note: 'The ticket belongs to the member who opened it. Whoever closed it is only named.',
  },
  {
    table: 'tickets',
    column: 'opener_id',
    action: 'tombstone',
    clear: ['subject'],
    note: 'The server keeps the ticket number, its dates and who handled it. The opener ID and the subject the opener typed go.',
  },
  { table: 'user_achievements', column: 'user_id', action: 'delete' },
  { table: 'user_cards', column: 'user_id', action: 'delete' },
  { table: 'user_consents', column: 'user_id', action: 'delete' },
  { table: 'user_dungeon_progress', column: 'user_id', action: 'delete' },
  { table: 'user_inventory_items', column: 'user_id', action: 'delete' },
  { table: 'users', column: 'id', action: 'delete' },
  { table: 'waifu_guild_members', column: 'user_id', action: 'delete' },
  {
    table: 'waifu_guilds',
    column: 'leader_user_id',
    action: 'tombstone',
    deleteWhenAlone: {
      table: 'waifu_guild_members',
      column: 'guild_id',
      userColumn: 'user_id',
      parentColumn: 'id',
    },
    note: 'A guild with other members stays and loses the name of its leader. A guild with no other member goes with the user.',
  },
  { table: 'web_known_devices', column: 'user_id', action: 'delete' },
  { table: 'web_passkeys', column: 'user_id', action: 'delete' },
  { table: 'web_sessions', column: 'user_id', action: 'delete' },
  { table: 'xp_accounts', column: 'user_id', action: 'delete' },
  { table: 'xp_events', column: 'user_id', action: 'delete' },
];

/** Tables without a user column whose rows go with a user row of the same erasure. */
export const USER_CHILD_DATA: readonly UserChildEntry[] = [
  {
    table: 'adventure_choices',
    column: 'session_id',
    parentTable: 'adventure_sessions',
    parentColumn: 'id',
    parentUserColumn: 'user_id',
  },
  {
    table: 'ai_messages',
    column: 'conversation_id',
    parentTable: 'ai_conversations',
    parentColumn: 'id',
    parentUserColumn: 'user_id',
  },
  {
    table: 'music_playlist_tracks',
    column: 'playlist_id',
    parentTable: 'music_saved_playlists',
    parentColumn: 'id',
    parentUserColumn: 'user_id',
  },
];

/**
 * JSON columns that other users' rows may carry the ID in (the other side of a transfer, a list
 * of winners, a game state). The ID is replaced as a quoted string, in values and in keys.
 */
export const USER_TEXT_DATA: readonly UserTextEntry[] = [
  {
    table: 'audit_logs',
    column: 'details',
    note: 'Entries of other actors name the user, for example a passkey reset or the winners of a giveaway.',
  },
  {
    table: 'economy_transactions',
    column: 'metadata',
    note: 'A transfer records the other side in recipientId or senderId.',
  },
  {
    table: 'game_sessions',
    column: 'state',
    note: 'The state of a game can name its players.',
  },
  {
    table: 'moderation_cases',
    column: 'metadata',
    optIn: 'moderation',
    note: MODERATION_NOTE,
  },
];
