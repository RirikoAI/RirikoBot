import { describe, it, expect, beforeEach, vi, type MockInstance } from 'vitest';
import { createDatabaseClient, type SqliteDatabaseClient } from '@ririko/database';
import type { CommandContext } from '@ririko/discord';
import type { User, Guild, GuildMember, TextBasedChannel, Client, Message } from 'discord.js';
import { createBotServices, type BotServices } from '../../services.js';
import { createEconomyCommands } from './commands.js';
import { registerMessageListener } from '../../listeners/message.listener.js';
import { registerVoiceListener } from '../../listeners/voice.listener.js';

function createMockContext(params: {
  userId?: string;
  username?: string;
  guildId?: string;
  optionsMap?: Record<string, unknown>;
  replyFn?: (res: unknown) => Promise<unknown>;
  rawArgs?: string[];
  attachments?: unknown;
  source?: 'slash' | 'prefix';
  /** The invoking member (`ctx.member`). */
  member?: GuildMember | null;
  /** The member the `target` option resolves to (`ctx.options.getMember`). */
  targetMember?: GuildMember | null;
}): CommandContext {
  const user = {
    id: params.userId ?? 'user_commander_01',
    username: params.username ?? 'Commander',
  } as User;

  const guild = params.guildId
    ? ({ id: params.guildId, name: 'Avalon Guild' } as Guild)
    : ({ id: 'guild_01', name: 'Avalon Guild' } as Guild);

  const optionsMap = params.optionsMap ?? {};
  const reply = (params.replyFn ??
    vi.fn().mockResolvedValue({})) as unknown as CommandContext['reply'];

  return {
    source: params.source ?? 'slash',
    id: 'ctx-mock-1',
    client: {} as Client,
    guild,
    guildId: guild?.id ?? null,
    channel: {
      id: 'channel-1',
      send: vi.fn().mockResolvedValue({} as unknown as Message),
    } as unknown as TextBasedChannel,
    channelId: 'channel-1',
    member: params.member ?? null,
    user,
    commandName: 'economy',
    invokedName: 'economy',
    invokedPrefix: '/',
    isReplied: false,
    isDeferred: false,
    raw: { attachments: params.attachments ?? new Map() } as unknown as Message,
    options: {
      getString: (name: string) => (optionsMap[name] as string | undefined) ?? null,
      getInteger: (name: string) => (optionsMap[name] as number | undefined) ?? null,
      getNumber: (name: string) => (optionsMap[name] as number | undefined) ?? null,
      getBoolean: (name: string) => (optionsMap[name] as boolean | undefined) ?? null,
      getUser: async (name: string) => (optionsMap[name] as User | undefined) ?? null,
      getMember: async () => params.targetMember ?? null,
      getChannel: async () => null,
      getAttachment: () => null,
      getRawArgs: () => params.rawArgs ?? [],
    },
    reply,
    deferReply: vi.fn().mockResolvedValue(undefined),
    editReply: vi.fn().mockResolvedValue({} as unknown as Message),
    followUp: vi.fn().mockResolvedValue({} as unknown as Message),
    send: vi.fn().mockResolvedValue({} as unknown as Message),
  };
}

describe('Economy Discord Commands Suite & Gateway Listeners (TASK-0442)', () => {
  let client: SqliteDatabaseClient;
  let services: BotServices;
  let commands: Map<string, (ctx: CommandContext) => Promise<void>>;

  beforeEach(async () => {
    const rawClient = await createDatabaseClient({ dialect: 'sqlite', url: ':memory:' });
    if (rawClient.dialect !== 'sqlite') throw new Error('Expected sqlite client');
    client = rawClient;

    // Initialize full database schema
    client.raw.exec(`
      CREATE TABLE users (
        id TEXT PRIMARY KEY,
        username TEXT NOT NULL,
        display_name TEXT,
        avatar_url TEXT,
        profile_background_url TEXT,
        is_blacklisted INTEGER NOT NULL DEFAULT 0,
        warn_count INTEGER NOT NULL DEFAULT 0,
        notify_level_up INTEGER NOT NULL DEFAULT 1,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE economy_accounts (
        user_id TEXT PRIMARY KEY,
        is_frozen INTEGER NOT NULL DEFAULT 0,
        daily_streak INTEGER NOT NULL DEFAULT 0,
        last_daily_at INTEGER,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE economy_balances (
        user_id TEXT PRIMARY KEY,
        wallet_balance INTEGER NOT NULL DEFAULT 0,
        bank_balance INTEGER NOT NULL DEFAULT 0,
        bank_capacity INTEGER NOT NULL DEFAULT 10000,
        net_worth INTEGER NOT NULL DEFAULT 0,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE economy_transactions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        guild_id TEXT,
        type TEXT NOT NULL,
        amount INTEGER NOT NULL,
        currency TEXT NOT NULL DEFAULT 'CREDITS',
        balance_before INTEGER NOT NULL,
        balance_after INTEGER NOT NULL,
        source TEXT NOT NULL,
        metadata TEXT DEFAULT '{}',
        created_at INTEGER NOT NULL
      );

      CREATE TABLE economy_item_categories (

        id TEXT PRIMARY KEY,

        code TEXT UNIQUE,

        name TEXT NOT NULL,

        description TEXT

      );


      CREATE TABLE economy_items (
        id TEXT PRIMARY KEY,
        code TEXT UNIQUE,
        name TEXT NOT NULL,
        description TEXT NOT NULL,
        price INTEGER NOT NULL,
        rarity TEXT NOT NULL DEFAULT 'COMMON',
        category_id TEXT,
        icon_url TEXT,
        is_purchasable INTEGER NOT NULL DEFAULT 1,
        metadata TEXT DEFAULT '{}'
      );

      CREATE TABLE economy_inventories (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        item_id TEXT NOT NULL,
        quantity INTEGER NOT NULL DEFAULT 1,
        acquired_at INTEGER NOT NULL
      );

      CREATE TABLE economy_config (
        id TEXT PRIMARY KEY,
        daily_base_reward INTEGER NOT NULL DEFAULT 250,
        daily_streak_bonus_percent INTEGER NOT NULL DEFAULT 5,
        daily_max_streak_bonus_percent INTEGER NOT NULL DEFAULT 150,
        bank_base_capacity INTEGER NOT NULL DEFAULT 10000,
        bank_capacity_per_level INTEGER NOT NULL DEFAULT 2500,
        updated_by TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE xp_accounts (
        user_id TEXT NOT NULL,
        guild_id TEXT NOT NULL,
        xp INTEGER NOT NULL DEFAULT 0,
        level INTEGER NOT NULL DEFAULT 0,
        karma INTEGER NOT NULL DEFAULT 0,
        last_xp_at INTEGER,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        PRIMARY KEY (user_id, guild_id)
      );

      CREATE TABLE xp_events (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        guild_id TEXT NOT NULL,
        xp_awarded INTEGER NOT NULL,
        source TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );

      CREATE TABLE leaderboard_snapshots (
        user_id TEXT NOT NULL,
        guild_id TEXT NOT NULL,
        global_rank INTEGER NOT NULL,
        server_rank INTEGER NOT NULL,
        calculated_at INTEGER NOT NULL,
        PRIMARY KEY (user_id, guild_id)
      );

      CREATE TABLE guild_settings (
        guild_id TEXT PRIMARY KEY,
        prefix TEXT NOT NULL DEFAULT '!',
        locale TEXT NOT NULL DEFAULT 'en-US',
        timezone TEXT NOT NULL DEFAULT 'UTC',
        ai_channel_id TEXT,
        log_channel_id TEXT,
        escalation_steps TEXT,
        music_channel_id TEXT,
        welcomer_channel_id TEXT,
        welcomer_enabled INTEGER NOT NULL DEFAULT 0,
        welcomer_bg TEXT,
        farewell_channel_id TEXT,
        farewell_enabled INTEGER NOT NULL DEFAULT 0,
        farewell_bg TEXT,
        karma_notifications_enabled INTEGER NOT NULL DEFAULT 1,
        level_up_channel_id TEXT,
        xp_rate_percent INTEGER NOT NULL DEFAULT 100,
        no_xp_channel_ids TEXT NOT NULL DEFAULT '[]',
        no_xp_role_ids TEXT NOT NULL DEFAULT '[]',
        voice_xp_enabled INTEGER NOT NULL DEFAULT 0,
        max_game_wager INTEGER,
        tcg_drops_enabled INTEGER NOT NULL DEFAULT 0,
        tcg_drop_channel_id TEXT,
        tcg_drop_message_threshold INTEGER NOT NULL DEFAULT 50,
        tcg_drop_start_hour INTEGER NOT NULL DEFAULT 8,
        tcg_drop_end_hour INTEGER NOT NULL DEFAULT 23,
        tcg_drop_claim_timeout_seconds INTEGER NOT NULL DEFAULT 60,
        tcg_drop_cooldown_minutes INTEGER NOT NULL DEFAULT 5,
        tcg_manager_role_id TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE player_energy (
        user_id TEXT PRIMARY KEY,
        current_energy INTEGER NOT NULL DEFAULT 100,
        max_energy INTEGER NOT NULL DEFAULT 100,
        bonus_energy INTEGER NOT NULL DEFAULT 0,
        daily_energy_pots_used INTEGER NOT NULL DEFAULT 0,
        last_replenished_at INTEGER NOT NULL,
        last_reset_date TEXT NOT NULL,
        last_potion_reset_date TEXT,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE tcg_system_configs (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_by TEXT,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE waifu_cards (
        id TEXT PRIMARY KEY,
        asset_id TEXT NOT NULL,
        name TEXT NOT NULL,
        rarity TEXT NOT NULL,
        element TEXT NOT NULL,
        attack INTEGER NOT NULL,
        defense INTEGER NOT NULL,
        speed INTEGER NOT NULL,
        health INTEGER NOT NULL,
        crit_rate REAL NOT NULL DEFAULT 0.05,
        skill_name TEXT,
        skill_description TEXT,
        passive_name TEXT,
        passive_description TEXT,
        collection_number INTEGER NOT NULL,
        is_active INTEGER NOT NULL DEFAULT 1
      );

      CREATE TABLE user_cards (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        card_id TEXT NOT NULL,
        serial_number INTEGER NOT NULL,
        level INTEGER NOT NULL DEFAULT 1,
        exp INTEGER NOT NULL DEFAULT 0,
        battles_won INTEGER NOT NULL DEFAULT 0,
        state TEXT NOT NULL DEFAULT 'IDLE',
        is_favorite INTEGER NOT NULL DEFAULT 0,
        obtained_at INTEGER NOT NULL
      );

      CREATE TABLE waifu_sources (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        base_url TEXT NOT NULL,
        attribution_text TEXT NOT NULL,
        is_active INTEGER NOT NULL DEFAULT 1
      );

      CREATE TABLE waifu_assets (
        id TEXT PRIMARY KEY,
        source_id TEXT NOT NULL,
        source_image_id TEXT NOT NULL,
        character_name TEXT NOT NULL,
        anime_title TEXT NOT NULL,
        image_hash TEXT NOT NULL UNIQUE,
        local_storage_path TEXT,
        discord_cdn_url TEXT,
        is_deleted_by_request INTEGER NOT NULL DEFAULT 0,
        tags TEXT NOT NULL DEFAULT '[]',
        created_at INTEGER NOT NULL
      );
    `);

    services = await createBotServices(client);
    const cmdList = createEconomyCommands(services);
    commands = new Map(cmdList.map((c) => [c.metadata.name, c.execute]));
  });

  describe('1. /balance command', () => {
    it('returns author balance when no target is specified', async () => {
      await services.economyRepo.create({
        userId: 'user_commander_01',
        walletBalance: 1500,
        bankBalance: 4500,
        bankCapacity: 10000,
        netWorth: 6000,
      });

      const replyFn = vi.fn().mockResolvedValue(undefined);
      const ctx = createMockContext({ userId: 'user_commander_01', replyFn });

      await commands.get('balance')!(ctx);

      expect(replyFn).toHaveBeenCalledTimes(1);
      const callArgs = replyFn.mock.calls[0]?.[0];
      expect(callArgs.content).toContain('1,500 credits');
      expect(callArgs.content).toContain('4,500 / 10,000 credits');
      expect(callArgs.content).toContain('6,000 credits');
    });

    it('returns target balance when target option is specified', async () => {
      const targetUser = { id: 'target_user_02', username: 'Arthur' } as User;
      await services.economyRepo.create({
        userId: 'target_user_02',
        walletBalance: 9999,
        bankBalance: 0,
        bankCapacity: 10000,
        netWorth: 9999,
      });

      const replyFn = vi.fn().mockResolvedValue(undefined);
      const ctx = createMockContext({
        optionsMap: { target: targetUser },
        replyFn,
      });

      await commands.get('balance')!(ctx);

      const callArgs = replyFn.mock.calls[0]?.[0];
      expect(callArgs.content).toContain("Arthur's Financial Balance");
      expect(callArgs.content).toContain('9,999 credits');
    });
  });

  describe('2. /daily command', () => {
    it('successfully claims daily reward and reflects in wallet', async () => {
      const recordProgress = vi
        .spyOn(services.achievementService, 'recordProgress')
        .mockResolvedValue([]);
      const replyFn = vi.fn().mockResolvedValue(undefined);
      const ctx = createMockContext({ userId: 'user_daily_01', replyFn });

      await commands.get('daily')!(ctx);

      expect(recordProgress).toHaveBeenCalledTimes(1);
      expect(recordProgress).toHaveBeenCalledWith('user_daily_01', 'DAILY_STREAK', 1, true);

      expect(replyFn).toHaveBeenCalledTimes(1);
      const callArgs = replyFn.mock.calls[0]?.[0];
      expect(callArgs.content).toContain('Daily Reward Claimed!');
      expect(callArgs.content).toContain('+250 credits');
      expect(callArgs.content).toContain('1 days');

      // Attempt second claim immediately -> cooldown message
      const replyFn2 = vi.fn().mockResolvedValue(undefined);
      const ctx2 = createMockContext({ userId: 'user_daily_01', replyFn: replyFn2 });
      await commands.get('daily')!(ctx2);

      const callArgs2 = replyFn2.mock.calls[0]?.[0];
      expect(callArgs2.content).toContain('Daily Reward Cooldown');
      expect(recordProgress).toHaveBeenCalledTimes(1);
    });

    it('still replies when recording the streak fails', async () => {
      vi.spyOn(services.achievementService, 'recordProgress').mockRejectedValue(
        new Error('database is down'),
      );
      const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
      const replyFn = vi.fn().mockResolvedValue(undefined);
      const ctx = createMockContext({ userId: 'user_daily_02', replyFn });

      await commands.get('daily')!(ctx);

      expect(replyFn.mock.calls[0]?.[0].content).toContain('Daily Reward Claimed!');
      expect(logged).toHaveBeenCalled();
      logged.mockRestore();
    });
  });

  describe('3. /deposit command', () => {
    beforeEach(async () => {
      await services.economyRepo.create({
        userId: 'user_dep_01',
        walletBalance: 2000,
        bankBalance: 500,
        bankCapacity: 10000,
        netWorth: 2500,
      });
    });

    it('deposits specific amount', async () => {
      const replyFn = vi.fn().mockResolvedValue(undefined);
      const ctx = createMockContext({
        userId: 'user_dep_01',
        optionsMap: { amount: '500' },
        replyFn,
      });

      await commands.get('deposit')!(ctx);

      const callArgs = replyFn.mock.calls[0]?.[0];
      expect(callArgs.content).toContain('Bank Deposit Successful!');
      expect(callArgs.content).toContain('500 credits');
      expect(callArgs.content).toContain('1,500 credits'); // wallet
      expect(callArgs.content).toContain('1,000 / 10,000 credits'); // bank
    });

    it('deposits "all" funds from wallet', async () => {
      const replyFn = vi.fn().mockResolvedValue(undefined);
      const ctx = createMockContext({
        userId: 'user_dep_01',
        optionsMap: { amount: 'all' },
        replyFn,
      });

      await commands.get('deposit')!(ctx);

      const callArgs = replyFn.mock.calls[0]?.[0];
      expect(callArgs.content).toContain('Deposited: **2,000 credits**');
      expect(callArgs.content).toContain('Wallet: **0 credits**');
      expect(callArgs.content).toContain('Bank: **2,500 / 10,000 credits**');
    });
  });

  describe('4. /withdraw command', () => {
    beforeEach(async () => {
      await services.economyRepo.create({
        userId: 'user_with_01',
        walletBalance: 100,
        bankBalance: 3000,
        bankCapacity: 10000,
        netWorth: 3100,
      });
    });

    it('withdraws specific amount from bank', async () => {
      const replyFn = vi.fn().mockResolvedValue(undefined);
      const ctx = createMockContext({
        userId: 'user_with_01',
        optionsMap: { amount: '1000' },
        replyFn,
      });

      await commands.get('withdraw')!(ctx);

      const callArgs = replyFn.mock.calls[0]?.[0];
      expect(callArgs.content).toContain('Bank Withdrawal Successful!');
      expect(callArgs.content).toContain('Withdrawn: **1,000 credits**');
      expect(callArgs.content).toContain('Wallet: **1,100 credits**');
      expect(callArgs.content).toContain('Bank: **2,000 credits**');
    });

    it('withdraws "all" bank balance', async () => {
      const replyFn = vi.fn().mockResolvedValue(undefined);
      const ctx = createMockContext({
        userId: 'user_with_01',
        optionsMap: { amount: 'all' },
        replyFn,
      });

      await commands.get('withdraw')!(ctx);

      const callArgs = replyFn.mock.calls[0]?.[0];
      expect(callArgs.content).toContain('Withdrawn: **3,000 credits**');
      expect(callArgs.content).toContain('Wallet: **3,100 credits**');
      expect(callArgs.content).toContain('Bank: **0 credits**');
    });
  });

  describe('5. /pay command', () => {
    beforeEach(async () => {
      await services.economyRepo.create({
        userId: 'user_sender_01',
        walletBalance: 5000,
        bankBalance: 0,
        bankCapacity: 10000,
        netWorth: 5000,
      });

      await services.economyRepo.create({
        userId: 'user_receiver_02',
        walletBalance: 100,
        bankBalance: 0,
        bankCapacity: 10000,
        netWorth: 100,
      });
    });

    it('transfers credits between two users', async () => {
      const target = { id: 'user_receiver_02', username: 'Receiver' } as User;
      const replyFn = vi.fn().mockResolvedValue(undefined);

      const ctx = createMockContext({
        userId: 'user_sender_01',
        optionsMap: { target, amount: 2000 },
        replyFn,
      });

      await commands.get('pay')!(ctx);

      const callArgs = replyFn.mock.calls[0]?.[0];
      expect(callArgs.content).toContain('Payment Complete!');
      expect(callArgs.content).toContain('2,000 credits');
      expect(callArgs.content).toContain('3,000 credits'); // sender wallet balance

      const recvBal = await services.economyRepo.findById('user_receiver_02');
      expect(recvBal?.walletBalance).toBe(2100);
    });

    it('rejects attempt to pay self', async () => {
      const target = { id: 'user_sender_01', username: 'Self' } as User;
      const replyFn = vi.fn().mockResolvedValue(undefined);

      const ctx = createMockContext({
        userId: 'user_sender_01',
        optionsMap: { target, amount: 500 },
        replyFn,
      });

      await commands.get('pay')!(ctx);

      const callArgs = replyFn.mock.calls[0]?.[0];
      expect(callArgs.content).toContain('You cannot transfer credits to yourself!');
    });
  });

  describe('6. /leaderboard command', () => {
    it('displays server and global leaderboards', async () => {
      const guildId = 'guild_lb_01';
      await services.xpRepo.create({
        userId: 'user_champ',
        guildId,
        xp: 8000,
        level: 10,
        karma: 50,
      });

      const replyFn = vi.fn().mockResolvedValue(undefined);
      const ctx = createMockContext({
        guildId,
        optionsMap: { scope: 'server', page: 1 },
        replyFn,
      });

      await commands.get('leaderboard')!(ctx);

      const callArgs = replyFn.mock.calls[0]?.[0];
      expect(callArgs.content).toContain('Leaderboard');
      expect(callArgs.content).toContain('LVL 10');
      expect(callArgs.content).toContain('8,000 XP');
    });
  });

  describe('7. /profile command', () => {
    it('renders 1200x400 card attachment when viewing profile', async () => {
      const userId = 'user_prof_01';
      await services.userRepo.create({
        id: userId,
        username: 'Saber',
        displayName: 'King of Knights',
        notifyLevelUp: true,
      });

      await services.economyRepo.create({
        userId,
        walletBalance: 12000,
        bankBalance: 80000,
        bankCapacity: 100000,
        netWorth: 92000,
      });

      const replyFn = vi.fn().mockResolvedValue(undefined);
      const ctx = createMockContext({ userId, username: 'Saber', replyFn });

      await commands.get('profile')!(ctx);

      expect(replyFn).toHaveBeenCalledTimes(1);
      const callArgs = replyFn.mock.calls[0]?.[0];
      expect(callArgs.content).toContain('Profile Card for Saber');
      expect(callArgs.files).toHaveLength(1);
      expect(callArgs.files[0].name).toBe(`profile_${userId}.png`);
      expect(Buffer.isBuffer(callArgs.files[0].attachment)).toBe(true);
    });

    describe('equipped card, server name and presence (BUG-0054)', () => {
      const userId = 'user_prof_card';
      const CARD_PNG = Buffer.from('rendered-card-png');
      const PROFILE_PNG = Buffer.from('profile-card-png');

      async function seedCard(options: {
        state: string;
        withAsset?: boolean;
      }): Promise<{ cardId: string; userCardId: string }> {
        if (options.withAsset ?? true) {
          client.raw.exec(`
            INSERT INTO waifu_sources (id, name, base_url, attribution_text)
              VALUES ('src_1', 'Test Source', 'https://src.test', 'Art by Test Source');
            INSERT INTO waifu_assets (id, source_id, source_image_id, character_name, anime_title, image_hash, created_at)
              VALUES ('asset_1', 'src_1', 'img_1', 'Holo', 'Spice and Wolf', 'hash_1', 0);
          `);
        }
        const card = await services.waifuCardRepo.create({
          id: 'card_holo',
          assetId: 'asset_1',
          name: 'Holo the Wise Wolf',
          rarity: 'LEGENDARY',
          element: 'EARTH',
          attack: 100,
          defense: 80,
          speed: 90,
          health: 900,
          collectionNumber: 1,
        });
        const userCard = await services.waifuCardRepo.createUserCard({
          id: 'ucard_holo',
          userId,
          cardId: card.id,
          serialNumber: 1,
          state: options.state,
        });
        return { cardId: card.id, userCardId: userCard.id };
      }

      function spyOnRenderer(): MockInstance<
        BotServices['profileCardRenderer']['renderFromRepositories']
      > {
        return vi
          .spyOn(services.profileCardRenderer, 'renderFromRepositories')
          .mockResolvedValue(PROFILE_PNG);
      }

      it('shows the equipped card, loading its image like /card inspect does', async () => {
        const { cardId, userCardId } = await seedCard({ state: 'EQUIPPED' });
        const getCardImage = vi
          .spyOn(services.cardImageService, 'getCardImage')
          .mockResolvedValue(CARD_PNG);
        const render = spyOnRenderer();
        const replyFn = vi.fn().mockResolvedValue(undefined);

        await commands.get('profile')!(createMockContext({ userId, username: 'Holo', replyFn }));

        expect(getCardImage).toHaveBeenCalledTimes(1);
        const [card, asset, imageOptions] = getCardImage.mock.calls[0]!;
        expect(card.id).toBe(cardId);
        expect(asset?.id).toBe('asset_1');
        expect(imageOptions).toEqual({
          attributionText: 'Art by Test Source',
          maxCollectionNumber: 1,
        });

        const options = render.mock.calls[0]?.[2];
        expect(options?.equippedCard).toEqual({
          id: userCardId,
          name: 'Holo the Wise Wolf',
          rarity: 'LEGENDARY',
          imageBuffer: CARD_PNG,
        });
        expect(replyFn.mock.calls[0]?.[0].files[0].attachment).toBe(PROFILE_PNG);
      });

      it('uses the default attribution when the card has no source row', async () => {
        await seedCard({ state: 'EQUIPPED', withAsset: false });
        const getCardImage = vi
          .spyOn(services.cardImageService, 'getCardImage')
          .mockResolvedValue(CARD_PNG);
        spyOnRenderer();

        await commands.get('profile')!(createMockContext({ userId }));

        const [, asset, imageOptions] = getCardImage.mock.calls[0]!;
        expect(asset).toBeNull();
        expect(imageOptions?.attributionText).toBe('Image source: waifu.im');
      });

      it('shows the equipped card of the target member, not the invoker', async () => {
        await seedCard({ state: 'EQUIPPED' });
        const getCardImage = vi
          .spyOn(services.cardImageService, 'getCardImage')
          .mockResolvedValue(CARD_PNG);
        const render = spyOnRenderer();
        const target = { id: userId, username: 'Holo' } as User;

        await commands.get('profile')!(
          createMockContext({ userId: 'someone_else', optionsMap: { target } }),
        );

        expect(getCardImage).toHaveBeenCalledTimes(1);
        expect(render.mock.calls[0]?.[0]).toBe(userId);
        expect(render.mock.calls[0]?.[2]?.equippedCard).toBeDefined();
      });

      it('still posts the profile, without the card, when the card image fails', async () => {
        await seedCard({ state: 'EQUIPPED' });
        vi.spyOn(services.cardImageService, 'getCardImage').mockRejectedValue(
          new Error('canvas boom'),
        );
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        const render = spyOnRenderer();
        const replyFn = vi.fn().mockResolvedValue(undefined);

        await commands.get('profile')!(createMockContext({ userId, replyFn }));

        expect(warn).toHaveBeenCalledTimes(1);
        expect(String(warn.mock.calls[0]?.[0])).toContain('[profile]');
        expect(render.mock.calls[0]?.[2]?.equippedCard).toBeUndefined();
        expect(replyFn.mock.calls[0]?.[0].files[0].attachment).toBe(PROFILE_PNG);
      });

      it('passes no card when none is equipped', async () => {
        await seedCard({ state: 'IDLE' });
        const getCardImage = vi.spyOn(services.cardImageService, 'getCardImage');
        const render = spyOnRenderer();

        await commands.get('profile')!(createMockContext({ userId }));

        expect(getCardImage).not.toHaveBeenCalled();
        expect(render.mock.calls[0]?.[2]?.equippedCard).toBeUndefined();
      });

      it('passes no card when the equipped card definition is gone', async () => {
        await services.waifuCardRepo.createUserCard({
          id: 'ucard_orphan',
          userId,
          cardId: 'card_missing',
          serialNumber: 1,
          state: 'EQUIPPED',
        });
        const getCardImage = vi.spyOn(services.cardImageService, 'getCardImage');
        const render = spyOnRenderer();

        await commands.get('profile')!(createMockContext({ userId }));

        expect(getCardImage).not.toHaveBeenCalled();
        expect(render.mock.calls[0]?.[2]?.equippedCard).toBeUndefined();
      });

      it("uses the invoker's server name and real presence", async () => {
        const render = spyOnRenderer();
        const member = {
          displayName: 'Nick Name',
          presence: { status: 'dnd' },
        } as unknown as GuildMember;

        await commands.get('profile')!(createMockContext({ userId, username: 'Saber', member }));

        const options = render.mock.calls[0]?.[2];
        expect(options?.displayName).toBe('Nick Name');
        expect(options?.presenceStatus).toBe('dnd');
        expect(options?.username).toBe('Saber');
      });

      it("uses the target's server name and presence, and maps invisible to offline", async () => {
        const render = spyOnRenderer();
        const target = {
          id: 'user_target',
          username: 'Arthur',
          displayName: 'Global Arthur',
        } as User;
        const targetMember = {
          displayName: 'Sir Arthur',
          presence: { status: 'invisible' },
        } as unknown as GuildMember;

        await commands.get('profile')!(
          createMockContext({
            userId,
            member: {
              displayName: 'Invoker Nick',
              presence: { status: 'online' },
            } as unknown as GuildMember,
            optionsMap: { target },
            targetMember,
          }),
        );

        const options = render.mock.calls[0]?.[2];
        expect(options?.displayName).toBe('Sir Arthur');
        expect(options?.presenceStatus).toBe('offline');
      });

      it('leaves the presence unknown and uses the account name when there is no member', async () => {
        const render = spyOnRenderer();
        const target = {
          id: 'user_target',
          username: 'Arthur',
          displayName: 'Global Arthur',
        } as User;
        const noName = { id: 'user_plain', username: 'plain_user' } as User;

        await commands.get('profile')!(createMockContext({ userId, optionsMap: { target } }));
        await commands.get('profile')!(
          createMockContext({ userId, optionsMap: { target: noName } }),
        );
        // A member the gateway sent without a presence (the bot has no presence intent).
        await commands.get('profile')!(
          createMockContext({
            userId,
            member: { displayName: 'No Presence' } as unknown as GuildMember,
          }),
        );

        const [first, second, third] = render.mock.calls.map((c) => c[2]);
        expect(first?.displayName).toBe('Global Arthur');
        expect(first?.presenceStatus).toBeUndefined();
        expect(second?.displayName).toBe('plain_user');
        expect(second?.presenceStatus).toBeUndefined();
        expect(third?.displayName).toBe('No Presence');
        expect(third?.presenceStatus).toBeUndefined();
      });
    });
  });

  describe('8. /shop command', () => {
    it('lists catalog of purchasable items', async () => {
      const replyFn = vi.fn().mockResolvedValue(undefined);
      const ctx = createMockContext({
        optionsMap: { action: 'list' },
        replyFn,
      });

      await commands.get('shop')!(ctx);

      const callArgs = replyFn.mock.calls[0]?.[0];
      expect(callArgs.content).toContain('Town Item Shop Catalog');
      expect(callArgs.content).toContain('__**Consumables**__');
      expect(callArgs.content).toContain('__**Cosmetics**__');
      expect(callArgs.content).toContain('candy_minor');
      expect(callArgs.content).toContain('stamina_potion');
      expect(callArgs.content).toContain('profile_bg_voucher');
    });

    it('purchases an item when wallet has sufficient credits', async () => {
      const userId = 'user_shopper_01';
      await services.economyRepo.create({
        userId,
        walletBalance: 1000,
        bankBalance: 0,
        bankCapacity: 10000,
        netWorth: 1000,
      });

      const replyFn = vi.fn().mockResolvedValue(undefined);
      const ctx = createMockContext({
        userId,
        optionsMap: { action: 'buy', item: 'stamina_potion', quantity: 1 },
        replyFn,
      });

      await commands.get('shop')!(ctx);

      const callArgs = replyFn.mock.calls[0]?.[0];
      expect(callArgs.content).toContain('Purchase Successful!');
      expect(callArgs.content).toContain('Stamina Potion');

      // Check item in inventory
      const qty = await services.inventoryService.getItemQuantity(userId, 'stamina_potion');
      expect(qty).toBe(1);
    });
  });

  describe('9. /inventory command', () => {
    it('displays inventory items owned by user', async () => {
      const userId = 'user_inv_01';
      await services.inventoryRepo.addItem(
        userId,
        (await services.itemRepo.findByCode('candy_minor'))!.id,
        3,
      );

      const replyFn = vi.fn().mockResolvedValue(undefined);
      const ctx = createMockContext({ userId, replyFn });

      await commands.get('inventory')!(ctx);

      const callArgs = replyFn.mock.calls[0]?.[0];
      expect(callArgs.content).toContain('Inventory Bag');
      expect(callArgs.content).toContain('x3');
    });
  });

  describe('10. /use command', () => {
    it('consumes item from inventory and applies effect', async () => {
      const userId = 'user_consumer_01';
      await services.inventoryRepo.addItem(
        userId,
        (await services.itemRepo.findByCode('candy_minor'))!.id,
        2,
      );

      const replyFn = vi.fn().mockResolvedValue(undefined);
      const ctx = createMockContext({
        userId,
        optionsMap: { item: 'candy_minor', quantity: 1 },
        replyFn,
      });

      await commands.get('use')!(ctx);

      const callArgs = replyFn.mock.calls[0]?.[0];
      expect(callArgs.content).toContain('Consumed 1x Minor Energy Candy');

      const remaining = await services.inventoryService.getItemQuantity(userId, 'candy_minor');
      expect(remaining).toBe(1);
    });
  });

  describe('11. /karma command', () => {
    it('views karma and awards karma to another user', async () => {
      const target = { id: 'user_karma_tgt', username: 'GoodMember' } as User;

      // Award Karma
      const replyFn = vi.fn().mockResolvedValue(undefined);
      const ctx = createMockContext({
        userId: 'user_karma_giver',
        guildId: 'guild_01',
        optionsMap: { action: 'give', target },
        replyFn,
      });

      await commands.get('karma')!(ctx);

      const callArgs = replyFn.mock.calls[0]?.[0];
      expect(callArgs.content).toContain('Karma Awarded!');
      expect(callArgs.content).toContain('Their Karma is now **1**');

      // View Karma
      const replyFn2 = vi.fn().mockResolvedValue(undefined);
      const ctx2 = createMockContext({
        guildId: 'guild_01',
        optionsMap: { action: 'view', target },
        replyFn: replyFn2,
      });

      await commands.get('karma')!(ctx2);

      const callArgs2 = replyFn2.mock.calls[0]?.[0];
      expect(callArgs2.content).toContain("GoodMember's Karma Rating");
      expect(callArgs2.content).toContain('Server Karma: **1**');
    });
  });

  describe('Gateway Event Listeners', () => {
    it('registers message and voice event listeners on client', () => {
      const mockClient = {
        on: vi.fn(),
      } as unknown as Client;

      registerMessageListener(mockClient, services);
      registerVoiceListener(mockClient, services);

      expect(mockClient.on).toHaveBeenCalledWith('messageCreate', expect.any(Function));
      expect(mockClient.on).toHaveBeenCalledWith('voiceStateUpdate', expect.any(Function));
    });
  });
});
