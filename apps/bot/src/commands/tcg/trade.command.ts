import { EmbedBuilder } from 'discord.js';
import {
  CommandCategory,
  type Command,
  type CommandContext,
} from '@ririko/discord';
import type { BotServices } from '../../services.js';
import type { TradeEnrichedCard } from '@ririko/services';
import type { CardTrade } from '@ririko/database';

export function createTradeCommand(services: BotServices): Command {
  return {
    metadata: {
      name: 'trade',
      category: CommandCategory.TCG,
      description: 'P2P Trading: Trade cards and credits with other players with state locking and atomic transfers.',
      aliases: ['cardtrade', 'tcgtrade'],
      usage: '/trade [action: request|accept|reject|cancel|view|list] [user] [offered_card_id] [requested_card_id] [offered_credits] [requested_credits] [trade_id]',
      examples: [
        '/trade action:request user:@Player offered_card_id:card123 requested_card_id:card456 offered_credits:100',
        '/trade action:accept trade_id:trade_xyz',
        '/trade action:reject trade_id:trade_xyz',
        '/trade action:cancel trade_id:trade_xyz',
        '/trade action:view trade_id:trade_xyz',
        '/trade action:list',
      ],
      options: [
        {
          name: 'action',
          description: 'Trade action (request, accept, reject, cancel, view, list)',
          type: 'STRING',
          required: false,
          choices: [
            { name: 'Request (Propose trade with player)', value: 'request' },
            { name: 'Accept (Confirm & complete pending trade)', value: 'accept' },
            { name: 'Reject (Decline pending trade)', value: 'reject' },
            { name: 'Cancel (Withdraw your trade proposal)', value: 'cancel' },
            { name: 'View (Inspect trade proposal details)', value: 'view' },
            { name: 'List (View your pending trades)', value: 'list' },
          ],
        },
        {
          name: 'user',
          description: 'Player to trade with',
          type: 'USER',
          required: false,
        },
        {
          name: 'offered_card_id',
          description: 'Your card ID to offer',
          type: 'STRING',
          required: false,
        },
        {
          name: 'requested_card_id',
          description: 'Target player card ID to request',
          type: 'STRING',
          required: false,
        },
        {
          name: 'offered_credits',
          description: 'Credits you offer in the trade',
          type: 'INTEGER',
          required: false,
        },
        {
          name: 'requested_credits',
          description: 'Credits you request from the other player',
          type: 'INTEGER',
          required: false,
        },
        {
          name: 'trade_id',
          description: 'Trade ID to accept, reject, cancel, or inspect',
          type: 'STRING',
          required: false,
        },
      ],
    },
    execute: async (ctx: CommandContext): Promise<void> => {
      const rawArgs = ctx.options.getRawArgs?.() ?? [];
      const action =
        ctx.options.getString('action')?.toLowerCase() ??
        rawArgs[0]?.toLowerCase() ??
        'list';

      const tradeService = services.tradeService;
      if (!tradeService) {
        await ctx.reply({ content: '❌ Trading service is currently unavailable.' });
        return;
      }

      if (action === 'request') {
        const targetUser = await ctx.options.getUser('user');
        const targetUserId = targetUser?.id ?? rawArgs[1]?.replace(/[<@!>]/g, '');

        if (!targetUserId) {
          await ctx.reply({ content: '❌ Please specify a user to trade with: `/trade action:request user:@Player`' });
          return;
        }

        const offeredCardId = ctx.options.getString('offered_card_id') ?? rawArgs[2];
        const requestedCardId = ctx.options.getString('requested_card_id') ?? rawArgs[3];
        const offeredCredits = ctx.options.getInteger('offered_credits') ?? (rawArgs[4] ? parseInt(rawArgs[4], 10) : 0);
        const requestedCredits = ctx.options.getInteger('requested_credits') ?? (rawArgs[5] ? parseInt(rawArgs[5], 10) : 0);

        const offeredCardIds = offeredCardId ? [offeredCardId] : [];
        const requestedCardIds = requestedCardId ? [requestedCardId] : [];

        try {
          const trade = await tradeService.createProposal({
            senderUserId: ctx.user.id,
            receiverUserId: targetUserId,
            offeredCardIds,
            requestedCardIds,
            offeredCredits,
            requestedCredits,
          });

          const embed = new EmbedBuilder()
            .setColor(0x5865f2)
            .setTitle('🤝 Trade Proposal Sent')
            .setDescription(
              `Trade proposal created for <@${targetUserId}>!\n\n` +
                `**Trade ID**: \`${trade.id}\`\n` +
                `**Offered Cards**: ${offeredCardIds.length > 0 ? offeredCardIds.map((id) => `\`${id}\``).join(', ') : 'None'}\n` +
                `**Offered Credits**: ${offeredCredits.toLocaleString()} Credits\n` +
                `**Requested Cards**: ${requestedCardIds.length > 0 ? requestedCardIds.map((id) => `\`${id}\``).join(', ') : 'None'}\n` +
                `**Requested Credits**: ${requestedCredits.toLocaleString()} Credits\n\n` +
                `*The recipient can accept with \`/trade action:accept trade_id:${trade.id}\`.*`,
            )
            .setFooter({ text: 'Ririko TCG P2P Trading • State locked to IN_TRADE' })
            .setTimestamp();

          await ctx.reply({ embeds: [embed] });
        } catch (error) {
          await ctx.reply({
            content: `❌ ${error instanceof Error ? error.message : String(error)}`,
          });
        }
        return;
      }

      if (action === 'accept') {
        const tradeId = ctx.options.getString('trade_id') ?? rawArgs[1];
        if (!tradeId) {
          await ctx.reply({ content: '❌ Please specify a trade ID to accept: `/trade action:accept trade_id:<id>`' });
          return;
        }

        try {
          const trade = await tradeService.acceptTrade(tradeId, ctx.user.id);
          const embed = new EmbedBuilder()
            .setColor(0x57f287)
            .setTitle('🎉 Trade Completed Successfully!')
            .setDescription(
              `Trade \`${trade.id}\` was accepted by <@${ctx.user.id}>!\n\n` +
                `All offered cards and credits have been atomically transferred. Card states are now unlocked to **IDLE**.`,
            )
            .setFooter({ text: 'Ririko TCG P2P Trading • Atomic ACID Transfer' })
            .setTimestamp();

          await ctx.reply({ embeds: [embed] });
        } catch (error) {
          await ctx.reply({
            content: `❌ ${error instanceof Error ? error.message : String(error)}`,
          });
        }
        return;
      }

      if (action === 'reject') {
        const tradeId = ctx.options.getString('trade_id') ?? rawArgs[1];
        if (!tradeId) {
          await ctx.reply({ content: '❌ Please specify a trade ID to reject: `/trade action:reject trade_id:<id>`' });
          return;
        }

        try {
          await tradeService.rejectTrade(tradeId, ctx.user.id);
          await ctx.reply({
            content: `🚫 Trade \`${tradeId}\` has been rejected. All locked cards have been returned to **IDLE**.`,
          });
        } catch (error) {
          await ctx.reply({
            content: `❌ ${error instanceof Error ? error.message : String(error)}`,
          });
        }
        return;
      }

      if (action === 'cancel') {
        const tradeId = ctx.options.getString('trade_id') ?? rawArgs[1];
        if (!tradeId) {
          await ctx.reply({ content: '❌ Please specify a trade ID to cancel: `/trade action:cancel trade_id:<id>`' });
          return;
        }

        try {
          await tradeService.cancelTrade(tradeId, ctx.user.id);
          await ctx.reply({
            content: `🛑 Trade \`${tradeId}\` has been cancelled. All locked cards have been returned to **IDLE**.`,
          });
        } catch (error) {
          await ctx.reply({
            content: `❌ ${error instanceof Error ? error.message : String(error)}`,
          });
        }
        return;
      }

      if (action === 'view') {
        const tradeId = ctx.options.getString('trade_id') ?? rawArgs[1];
        if (!tradeId) {
          await ctx.reply({ content: '❌ Please specify a trade ID to view: `/trade action:view trade_id:<id>`' });
          return;
        }

        try {
          const details = await tradeService.getTradeDetails(tradeId);
          if (!details) {
            await ctx.reply({ content: `❌ Trade \`${tradeId}\` not found.` });
            return;
          }

          const { trade, offeredCards, requestedCards } = details;
          const embed = new EmbedBuilder()
            .setColor(0x5865f2)
            .setTitle(`Trade Inspection: \`${trade.id}\``)
            .addFields(
              {
                name: 'Overview',
                value: `**Sender**: <@${trade.senderUserId}>\n**Receiver**: <@${trade.receiverUserId}>\n**Status**: \`${trade.status}\``,
              },
              {
                name: 'Offered by Sender',
                value:
                  (offeredCards.length > 0
                    ? offeredCards
                        .map(
                          (c: TradeEnrichedCard) =>
                            `• **${c.cardInfo?.name ?? 'Unknown'}** [${c.cardInfo?.rarity ?? 'COMMON'}] (ID: \`${c.userCard.id}\`)`,
                        )
                        .join('\n')
                    : 'No cards offered') +
                  `\n**Credits**: ${trade.offeredCredits.toLocaleString()} Credits`,
              },
              {
                name: 'Requested from Receiver',
                value:
                  (requestedCards.length > 0
                    ? requestedCards
                        .map(
                          (c: TradeEnrichedCard) =>
                            `• **${c.cardInfo?.name ?? 'Unknown'}** [${c.cardInfo?.rarity ?? 'COMMON'}] (ID: \`${c.userCard.id}\`)`,
                        )
                        .join('\n')
                    : 'No cards requested') +
                  `\n**Credits**: ${trade.requestedCredits.toLocaleString()} Credits`,
              },
            )
            .setFooter({ text: 'Ririko TCG P2P Trading' })
            .setTimestamp();

          await ctx.reply({ embeds: [embed] });
        } catch (error) {
          await ctx.reply({
            content: `❌ ${error instanceof Error ? error.message : String(error)}`,
          });
        }
        return;
      }

      // Default: list pending trades
      try {
        const pending = await tradeService.listPendingTrades(ctx.user.id);
        if (pending.length === 0) {
          await ctx.reply({
            content: 'ℹ️ You currently have no pending trade proposals. Propose one with `/trade action:request user:@Player`.',
          });
          return;
        }

        const embed = new EmbedBuilder()
          .setColor(0x5865f2)
          .setTitle('🤝 Your Pending Trade Proposals')
          .setDescription(
            pending
              .map((t: CardTrade) => {
                const isSender = t.senderUserId === ctx.user.id;
                const otherUser = isSender ? t.receiverUserId : t.senderUserId;
                const role = isSender ? 'Sent to' : 'Received from';
                return (
                  `• **ID**: \`${t.id}\` (${role} <@${otherUser}>)\n` +
                  `  Cards: ${t.offeredCardIds.length} offered, ${t.requestedCardIds.length} requested\n` +
                  `  Credits: ${t.offeredCredits} offered, ${t.requestedCredits} requested\n` +
                  `  *View: \`/trade action:view trade_id:${t.id}\`*`
                );
              })
              .join('\n\n'),
          )
          .setFooter({ text: 'Ririko TCG P2P Trading' })
          .setTimestamp();

        await ctx.reply({ embeds: [embed] });
      } catch (error) {
        await ctx.reply({
          content: `❌ ${error instanceof Error ? error.message : String(error)}`,
        });
      }
    },
  };
}
