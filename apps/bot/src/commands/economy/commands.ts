import {
  CommandCategory,
  type Command,
  type CommandContext,
} from '@ririko/discord';
import type { BotServices } from '../../services.js';

/**
 * Creates the complete suite of 11 dual-dispatch Economy commands with full Slash & Prefix parity:
 * - /balance (bal, money)
 * - /daily (d)
 * - /deposit (dep)
 * - /withdraw (with)
 * - /pay (give, transfer)
 * - /leaderboard (lb, top)
 * - /profile (rank)
 * - /shop (store)
 * - /inventory (inv, bag)
 * - /use (consume)
 * - /karma (k)
 */
export function createEconomyCommands(services: BotServices): Command[] {
  // 1. Balance Command
  const balanceCommand: Command = {
    metadata: {
      name: 'balance',
      category: CommandCategory.ECONOMY,
      description: "View your or another member's wallet credits, bank balance, and net worth.",
      aliases: ['bal', 'money'],
      usage: '/balance [target]',
      options: [
        {
          name: 'target',
          description: 'Target member to inspect',
          type: 'USER',
          required: false,
        },
      ],
    },
    async execute(ctx: CommandContext): Promise<void> {
      const target = (await ctx.options.getUser('target')) ?? ctx.user;
      const bal = await services.economyRepo.findById(target.id);

      const wallet = (bal?.walletBalance ?? 0).toLocaleString();
      const bank = (bal?.bankBalance ?? 0).toLocaleString();
      const capacity = (bal?.bankCapacity ?? 10000).toLocaleString();
      const netWorth = (bal?.netWorth ?? 0).toLocaleString();

      await ctx.reply({
        content: `🪙 **${target.username}'s Financial Balance**\n• **Wallet**: \`${wallet} credits\`\n• **Bank**: \`${bank} / ${capacity} credits\`\n• **Net Worth**: \`${netWorth} credits\``,
      });
    },
  };

  // 2. Daily Command
  const dailyCommand: Command = {
    metadata: {
      name: 'daily',
      category: CommandCategory.ECONOMY,
      description: 'Claim your daily credits reward and build your consecutive streak bonus.',
      aliases: ['d'],
      usage: '/daily',
    },
    async execute(ctx: CommandContext): Promise<void> {
      const res = await services.dailyService.claimDaily(ctx.user.id, ctx.guild?.id);

      if (res.success) {
        const bonusPercent = Math.round((res.multiplier - 1.0) * 100);
        await ctx.reply({
          content: `🎉 **Daily Reward Claimed!**\n• Awarded: **+${res.creditsAwarded} credits**\n• Consecutive Streak: **${res.streak} days** (+${bonusPercent}% bonus)\n• Wallet Balance: **${(res.walletBalance ?? 0).toLocaleString()} credits**`,
        });
      } else {
        await ctx.reply({
          content: `⏳ **Daily Reward Cooldown**\n${res.reason}`,
        });
      }
    },
  };

  // 3. Deposit Command
  const depositCommand: Command = {
    metadata: {
      name: 'deposit',
      category: CommandCategory.ECONOMY,
      description: 'Deposit credits from your wallet into your secure bank account.',
      aliases: ['dep'],
      usage: '/deposit <amount | all>',
      options: [
        {
          name: 'amount',
          description: 'Number of credits or "all"',
          type: 'STRING',
          required: true,
        },
      ],
    },
    async execute(ctx: CommandContext): Promise<void> {
      const raw = ctx.options.getString('amount', true);
      if (!raw) {
        await ctx.reply({ content: '❌ Please specify an amount or "all" to deposit.' });
        return;
      }

      let amount: number;
      if (raw.toLowerCase() === 'all') {
        const bal = await services.economyRepo.findById(ctx.user.id);
        amount = bal ? bal.walletBalance : 0;
      } else {
        amount = Number.parseInt(raw, 10);
      }

      if (Number.isNaN(amount) || amount <= 0) {
        await ctx.reply({ content: '❌ Deposit amount must be a positive integer or "all".' });
        return;
      }

      const res = await services.bankingService.deposit(ctx.user.id, amount, ctx.guild?.id);
      if (res.success) {
        await ctx.reply({
          content: `🏦 **Bank Deposit Successful!**\n• Deposited: **${res.amount.toLocaleString()} credits**\n• Wallet: **${(res.walletBalance ?? 0).toLocaleString()} credits**\n• Bank: **${(res.bankBalance ?? 0).toLocaleString()} / ${(res.bankCapacity ?? 10000).toLocaleString()} credits**`,
        });
      } else {
        await ctx.reply({
          content: `❌ **Deposit Failed**: ${res.reason}`,
        });
      }
    },
  };

  // 4. Withdraw Command
  const withdrawCommand: Command = {
    metadata: {
      name: 'withdraw',
      category: CommandCategory.ECONOMY,
      description: 'Withdraw credits from your bank account into your active wallet.',
      aliases: ['with'],
      usage: '/withdraw <amount | all>',
      options: [
        {
          name: 'amount',
          description: 'Number of credits or "all"',
          type: 'STRING',
          required: true,
        },
      ],
    },
    async execute(ctx: CommandContext): Promise<void> {
      const raw = ctx.options.getString('amount', true);
      if (!raw) {
        await ctx.reply({ content: '❌ Please specify an amount or "all" to withdraw.' });
        return;
      }

      let amount: number;
      if (raw.toLowerCase() === 'all') {
        const bal = await services.economyRepo.findById(ctx.user.id);
        amount = bal ? bal.bankBalance : 0;
      } else {
        amount = Number.parseInt(raw, 10);
      }

      if (Number.isNaN(amount) || amount <= 0) {
        await ctx.reply({ content: '❌ Withdrawal amount must be a positive integer or "all".' });
        return;
      }

      const res = await services.bankingService.withdraw(ctx.user.id, amount, ctx.guild?.id);
      if (res.success) {
        await ctx.reply({
          content: `🏧 **Bank Withdrawal Successful!**\n• Withdrawn: **${res.amount.toLocaleString()} credits**\n• Wallet: **${(res.walletBalance ?? 0).toLocaleString()} credits**\n• Bank: **${(res.bankBalance ?? 0).toLocaleString()} credits**`,
        });
      } else {
        await ctx.reply({
          content: `❌ **Withdrawal Failed**: ${res.reason}`,
        });
      }
    },
  };

  // 5. Pay Command
  const payCommand: Command = {
    metadata: {
      name: 'pay',
      category: CommandCategory.ECONOMY,
      description: 'Transfer credits from your wallet to another member.',
      aliases: ['give', 'transfer'],
      usage: '/pay <target> <amount>',
      options: [
        {
          name: 'target',
          description: 'Member to receive credits',
          type: 'USER',
          required: true,
        },
        {
          name: 'amount',
          description: 'Number of credits to transfer',
          type: 'INTEGER',
          required: true,
          minValue: 1,
        },
      ],
    },
    async execute(ctx: CommandContext): Promise<void> {
      const target = await ctx.options.getUser('target', true);
      const amount = ctx.options.getInteger('amount', true);

      if (!target || !amount) {
        await ctx.reply({ content: '❌ Please specify both a recipient member and a valid amount.' });
        return;
      }

      if (target.id === ctx.user.id) {
        await ctx.reply({ content: '❌ You cannot transfer credits to yourself!' });
        return;
      }

      const res = await services.bankingService.transfer({
        fromUserId: ctx.user.id,
        toUserId: target.id,
        amount,
        guildId: ctx.guild?.id,
      });

      if (res.success) {
        await ctx.reply({
          content: `💸 **Payment Complete!**\n• Sent: **${res.amount.toLocaleString()} credits** to <@${target.id}>\n• Your New Wallet Balance: **${(res.fromWalletBalance ?? 0).toLocaleString()} credits**`,
        });
      } else {
        await ctx.reply({
          content: `❌ **Payment Failed**: ${res.reason}`,
        });
      }
    },
  };

  // 6. Leaderboard Command
  const leaderboardCommand: Command = {
    metadata: {
      name: 'leaderboard',
      category: CommandCategory.ECONOMY,
      description: 'View the server or global experience and leveling rankings.',
      aliases: ['lb', 'top'],
      usage: '/leaderboard [scope] [page]',
      options: [
        {
          name: 'scope',
          description: 'Leaderboard scope (server or global)',
          type: 'STRING',
          required: false,
          choices: [
            { name: 'Server', value: 'server' },
            { name: 'Global', value: 'global' },
          ],
        },
        {
          name: 'page',
          description: 'Page number',
          type: 'INTEGER',
          required: false,
          minValue: 1,
        },
      ],
    },
    async execute(ctx: CommandContext): Promise<void> {
      const scope = (ctx.options.getString('scope') ?? 'server').toLowerCase();
      const page = ctx.options.getInteger('page') ?? 1;

      if (scope === 'global') {
        const lb = await services.leaderboardService.getGlobalLeaderboard(page, 10);
        if (lb.items.length === 0) {
          await ctx.reply({ content: '📊 Global leaderboard is currently empty.' });
          return;
        }

        const lines = lb.items.map(
          (e) =>
            `\`#${String(e.rank).padStart(2, ' ')}\` <@${e.userId}> — **LVL ${e.level}** (${e.xp.toLocaleString()} XP)`,
        );

        await ctx.reply({
          content: `🏆 **Global Leveling Leaderboard** (Page ${lb.page}/${lb.totalPages || 1})\n\n${lines.join('\n')}`,
        });
      } else {
        if (!ctx.guild) {
          await ctx.reply({ content: '❌ Server leaderboard can only be accessed within a Discord server.' });
          return;
        }

        const lb = await services.leaderboardService.getServerLeaderboard(ctx.guild.id, page, 10);
        if (lb.items.length === 0) {
          await ctx.reply({ content: '📊 Server leaderboard has no ranked members yet. Start chatting to gain XP!' });
          return;
        }

        const lines = lb.items.map(
          (e) =>
            `\`#${String(e.rank).padStart(2, ' ')}\` <@${e.userId}> — **LVL ${e.level}** (${e.xp.toLocaleString()} XP)`,
        );

        await ctx.reply({
          content: `🏆 **${ctx.guild.name} Leaderboard** (Page ${lb.page}/${lb.totalPages || 1})\n\n${lines.join('\n')}`,
        });
      }
    },
  };

  // 7. Profile Command (with Canvas 2.0 Renderer & SSRF Background Manager)
  const profileCommand: Command = {
    metadata: {
      name: 'profile',
      category: CommandCategory.ECONOMY,
      description: 'View your 1200x400 Profile Card 2.0 or configure a custom profile background.',
      aliases: ['rank'],
      usage: '/profile [target] [background]',
      options: [
        {
          name: 'target',
          description: 'Member whose profile to view',
          type: 'USER',
          required: false,
        },
        {
          name: 'background',
          description: 'URL of a custom background image (1200x400 max)',
          type: 'STRING',
          required: false,
        },
      ],
    },
    async execute(ctx: CommandContext): Promise<void> {
      let bgUrl = ctx.options.getString('background');

      // 1. In prefix commands or raw input, auto-detect if any argument is an image/web URL
      if (!bgUrl) {
        const rawArgs = ctx.options.getRawArgs();
        for (const arg of rawArgs) {
          if (/^https?:\/\//i.test(arg.trim())) {
            bgUrl = arg.trim();
            break;
          }
        }
      }

      // 2. Direct Discord attachment auto-detection (uploading an image file)
      if (!bgUrl) {
        const attachment = ctx.options.getAttachment('background');
        if (attachment?.url) {
          bgUrl = attachment.url;
        } else if (ctx.source === 'prefix' && 'attachments' in ctx.raw && ctx.raw.attachments && ctx.raw.attachments.size > 0) {
          const firstAttachment = ctx.raw.attachments.first();
          if (firstAttachment && (firstAttachment.contentType?.startsWith("image/") || /\.(png|jpe?g|webp)$/i.test(firstAttachment.name ?? ""))) {
            bgUrl = firstAttachment.url;
          }
        }
      }

      // Sub-action: set custom background strictly for the command issuer (current user)
      if (bgUrl) {
        const avatarUrl = ctx.user.displayAvatarURL
          ? ctx.user.displayAvatarURL({ extension: 'png', size: 256 })
          : undefined;

        const res = await services.profileBackgroundManager.setBackground({
          userId: ctx.user.id,
          url: bgUrl,
          consumeToken: false,
          username: ctx.user.username,
          displayName: ctx.user.displayName ?? ctx.user.username,
          avatarUrl,
        });

        if (res.success) {
          await ctx.reply({
            content: `🖼️ **Custom Profile Background Updated!**\n• Dimensions: \`${res.dimensions?.width}x${res.dimensions?.height}px\`\n• Format: \`${res.format?.toUpperCase()}\`\n• Size: \`${((res.fileSizeBytes ?? 0) / 1024).toFixed(1)} KB\``,
          });
        } else {
          await ctx.reply({
            content: `❌ **Failed to Set Background**: ${res.reason}`,
          });
        }
        return;
      }

      // Default: Render 1200x400 Profile Card 2.0
      const target = (await ctx.options.getUser('target')) ?? ctx.user;
      const avatarUrl = target.displayAvatarURL
        ? target.displayAvatarURL({ extension: 'png', size: 256 })
        : undefined;

      try {
        const buffer = await services.profileCardRenderer.renderFromRepositories(
          target.id,
          ctx.guild?.id,
          {
            presenceStatus: 'online',
            username: target.username,
            displayName: target.displayName ?? target.username,
            avatarUrl,
          },
        );

        await ctx.reply({
          content: `🎴 **Profile Card for ${target.username}**`,
          files: [
            {
              attachment: buffer,
              name: `profile_${target.id}.png`,
            },
          ],
        });
      } catch (err: unknown) {
        await ctx.reply({
          content: `❌ Error generating profile card: ${err instanceof Error ? err.message : String(err)}`,
        });
      }
    },
  };

  // 8. Shop Command
  const shopCommand: Command = {
    metadata: {
      name: 'shop',
      category: CommandCategory.ECONOMY,
      description: 'Browse the town item shop catalog or purchase goods with wallet credits.',
      aliases: ['store'],
      usage: '/shop [action] [item] [quantity]',
      options: [
        {
          name: 'action',
          description: 'Action (list or buy)',
          type: 'STRING',
          required: false,
          choices: [
            { name: 'List Catalog', value: 'list' },
            { name: 'Buy Item', value: 'buy' },
          ],
        },
        {
          name: 'item',
          description: 'Item ID to purchase',
          type: 'STRING',
          required: false,
        },
        {
          name: 'quantity',
          description: 'Quantity to purchase',
          type: 'INTEGER',
          required: false,
          minValue: 1,
        },
      ],
    },
    async execute(ctx: CommandContext): Promise<void> {
      const action = ctx.options.getString('action') ?? (ctx.options.getString('item') ? 'buy' : 'list');

      if (action === 'buy') {
        const itemId = ctx.options.getString('item');
        if (!itemId) {
          await ctx.reply({ content: '❌ Please specify an item ID to purchase. Use `/shop list` to view catalog.' });
          return;
        }
        const quantity = ctx.options.getInteger('quantity') ?? 1;

        const res = await services.inventoryService.buyItem({
          userId: ctx.user.id,
          itemId,
          quantity,
          guildId: ctx.guild?.id,
        });

        if (res.success) {
          await ctx.reply({
            content: `🛍️ **Purchase Successful!**\n• Acquired: **${res.quantity}x ${res.item?.name}**\n• Cost: **${res.totalPrice?.toLocaleString()} credits**\n• Remaining Wallet: **${(res.walletBalanceAfter ?? 0).toLocaleString()} credits**`,
          });
        } else {
          await ctx.reply({
            content: `❌ **Purchase Failed**: ${res.reason}`,
          });
        }
      } else {
        const catalog = await services.inventoryService.getCatalog();
        if (catalog.length === 0) {
          await ctx.reply({ content: '🛒 The item shop is currently closed.' });
          return;
        }

        const lines = catalog.map(
          (item) =>
            `• **${item.name}** (\`${item.id}\`) — 🪙 **${item.price.toLocaleString()} credits**\n  *${item.description}*`,
        );

        await ctx.reply({
          content: `🏪 **Town Item Shop Catalog**\n\n${lines.join('\n\n')}\n\n*Purchase items using:* \`/shop buy <item_id> [quantity]\``,
        });
      }
    },
  };

  // 9. Inventory Command
  const inventoryCommand: Command = {
    metadata: {
      name: 'inventory',
      category: CommandCategory.ECONOMY,
      description: 'View items, consumables, and vouchers in your inventory bag.',
      aliases: ['inv', 'bag'],
      usage: '/inventory [target]',
      options: [
        {
          name: 'target',
          description: 'Member whose inventory to view',
          type: 'USER',
          required: false,
        },
      ],
    },
    async execute(ctx: CommandContext): Promise<void> {
      const target = (await ctx.options.getUser('target')) ?? ctx.user;
      const items = await services.inventoryService.getUserInventory(target.id);

      if (items.length === 0) {
        await ctx.reply({
          content: `🎒 **${target.username}'s Inventory** is currently empty.\nVisit \`/shop\` to acquire items and potions!`,
        });
        return;
      }

      const lines = items.map((slot) => {
        const itemName = slot.item?.name ?? slot.itemId;
        const rarity = slot.item?.rarity ?? 'COMMON';
        return `• **${itemName}** \`x${slot.quantity}\` [${rarity}] — ID: \`${slot.itemId}\`\n  *${slot.item?.description ?? 'No description'}*`;
      });

      await ctx.reply({
        content: `🎒 **${target.username}'s Inventory Bag** (${items.length} unique items)\n\n${lines.join('\n\n')}\n\n*Use an item with:* \`/use <item_id>\``,
      });
    },
  };

  // 10. Use Command
  const useCommand: Command = {
    metadata: {
      name: 'use',
      category: CommandCategory.ECONOMY,
      description: 'Consume a potion or item from your inventory bag.',
      aliases: ['consume'],
      usage: '/use <item> [quantity]',
      options: [
        {
          name: 'item',
          description: 'Item ID to consume',
          type: 'STRING',
          required: true,
        },
        {
          name: 'quantity',
          description: 'Quantity to consume',
          type: 'INTEGER',
          required: false,
          minValue: 1,
        },
      ],
    },
    async execute(ctx: CommandContext): Promise<void> {
      const itemId = ctx.options.getString('item', true);
      if (!itemId) {
        await ctx.reply({ content: '❌ Please specify the item ID to use.' });
        return;
      }

      const quantity = ctx.options.getInteger('quantity') ?? 1;

      const res = await services.inventoryService.useItem({
        userId: ctx.user.id,
        itemId,
        quantity,
        guildId: ctx.guild?.id,
      });

      if (res.success) {
        const effectStr = res.effectSummary ? `\n\n**Effects Applied:**\n• ${res.effectSummary}` : '';

        await ctx.reply({
          content: `✨ **Consumed ${res.quantityUsed}x ${res.item?.name}!**${effectStr}\nRemaining in inventory: \`${res.remainingQuantity}\``,
        });
      } else {
        await ctx.reply({
          content: `❌ **Cannot Use Item**: ${res.reason}`,
        });
      }
    },
  };

  // 11. Karma Command
  const karmaCommand: Command = {
    metadata: {
      name: 'karma',
      category: CommandCategory.ECONOMY,
      description: 'Inspect your Karma or award appreciation Karma to another member.',
      aliases: ['k'],
      usage: '/karma [action] [target]',
      options: [
        {
          name: 'action',
          description: 'Action (view or give)',
          type: 'STRING',
          required: false,
          choices: [
            { name: 'View Karma', value: 'view' },
            { name: 'Give Karma (+1)', value: 'give' },
          ],
        },
        {
          name: 'target',
          description: 'Target member',
          type: 'USER',
          required: false,
        },
      ],
    },
    async execute(ctx: CommandContext): Promise<void> {
      const action = ctx.options.getString('action') ?? 'view';
      const target = (await ctx.options.getUser('target')) ?? ctx.user;

      if (action === 'give') {
        if (target.id === ctx.user.id) {
          await ctx.reply({ content: '❌ You cannot award Karma to yourself!' });
          return;
        }

        if (!ctx.guild) {
          await ctx.reply({ content: '❌ Karma can only be awarded inside a Discord server.' });
          return;
        }

        const newKarma = await services.levelingService.awardKarma(target.id, ctx.guild.id, 1);
        await ctx.reply({
          content: `✨ **Karma Awarded!**\n<@${ctx.user.id}> awarded **1 Karma** to <@${target.id}>! Their Karma is now **${newKarma}**.`,
        });
      } else {
        const guildId = ctx.guild?.id ?? 'global';
        const profile = await services.levelingService.getKarmaProfile(target.id, guildId);
        await ctx.reply({
          content: `✨ **${target.username}'s Karma Rating**\n• Server Karma: **${profile.karma}**`,
        });
      }
    },
  };

  return [
    balanceCommand,
    dailyCommand,
    depositCommand,
    withdrawCommand,
    payCommand,
    leaderboardCommand,
    profileCommand,
    shopCommand,
    inventoryCommand,
    useCommand,
    karmaCommand,
  ];
}
