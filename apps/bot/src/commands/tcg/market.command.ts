import { EmbedBuilder } from 'discord.js';
import { CommandCategory, type Command, type CommandContext } from '@ririko/discord';
import type { BotServices } from '../../services.js';
import type { MarketListing } from '@ririko/database';
import type { EnrichedMarketListing } from '@ririko/services';

export function createMarketCommand(services: BotServices): Command {
  return {
    metadata: {
      name: 'market',
      category: CommandCategory.TCG,
      description:
        'Community Player Marketplace: Buy and sell cards with 5% market tax and 7-day automatic expiration.',
      aliases: ['marketplace', 'tcgmarket'],
      usage:
        '/market [action: list|browse|buy|cancel|my-listings] [card_id] [price] [listing_id] [page]',
      examples: [
        '/market action:list card_id:card_123 price:2000',
        '/market action:browse page:1',
        '/market action:buy listing_id:listing_abc',
        '/market action:cancel listing_id:listing_abc',
        '/market action:my-listings',
      ],
      options: [
        {
          name: 'action',
          description: 'Market action (list, browse, buy, cancel, my-listings)',
          type: 'STRING',
          required: false,
          choices: [
            { name: 'Browse (Browse active marketplace listings)', value: 'browse' },
            { name: 'List (List a card for sale at custom price)', value: 'list' },
            { name: 'Buy (Purchase an active listing with credits)', value: 'buy' },
            { name: 'Cancel (Withdraw your active listing)', value: 'cancel' },
            { name: 'My Listings (View your active listings)', value: 'my-listings' },
          ],
        },
        {
          name: 'card_id',
          description: 'User card ID to list for sale',
          type: 'STRING',
          required: false,
        },
        {
          name: 'price',
          description: 'Credit sale price for your listing',
          type: 'INTEGER',
          required: false,
        },
        {
          name: 'listing_id',
          description: 'Listing ID to buy or cancel',
          type: 'STRING',
          required: false,
        },
        {
          name: 'page',
          description: 'Page number to browse',
          type: 'INTEGER',
          required: false,
        },
      ],
    },
    execute: async (ctx: CommandContext): Promise<void> => {
      const rawArgs = ctx.options.getRawArgs?.() ?? [];
      const action =
        ctx.options.getString('action')?.toLowerCase() ?? rawArgs[0]?.toLowerCase() ?? 'browse';

      const marketService = services.marketService;
      if (!marketService) {
        await ctx.reply({ content: '❌ Marketplace service is currently unavailable.' });
        return;
      }

      if (action === 'list') {
        const cardId = ctx.options.getString('card_id') ?? rawArgs[1];
        const price =
          ctx.options.getInteger('price') ?? (rawArgs[2] ? parseInt(rawArgs[2], 10) : NaN);

        if (!cardId || isNaN(price) || price <= 0) {
          await ctx.reply({
            content: '❌ Usage: `/market action:list card_id:<id> price:<credits>`',
          });
          return;
        }

        try {
          const listing = await marketService.listCard({
            sellerUserId: ctx.user.id,
            userCardId: cardId,
            price,
          });

          const embed = new EmbedBuilder()
            .setColor(0x5865f2)
            .setTitle('🛒 Card Listed on Marketplace')
            .setDescription(
              `Successfully listed card on the player marketplace!\n\n` +
                `**Listing ID**: \`${listing.id}\`\n` +
                `**Card ID**: \`${listing.userCardId}\`\n` +
                `**Price**: ${listing.price.toLocaleString()} Credits\n` +
                `**Market Tax (5%)**: ${listing.taxPaid.toLocaleString()} Credits (deducted on sale)\n` +
                `**Expires In**: 7 Days\n\n` +
                `*Other players can buy with \`/market action:buy listing_id:${listing.id}\`.*`,
            )
            .setFooter({ text: 'Ririko Player Marketplace • State locked to IN_MARKET' })
            .setTimestamp();

          await ctx.reply({ embeds: [embed] });
        } catch (error) {
          await ctx.reply({
            content: `❌ ${error instanceof Error ? error.message : String(error)}`,
          });
        }
        return;
      }

      if (action === 'buy') {
        const listingId = ctx.options.getString('listing_id') ?? rawArgs[1];
        if (!listingId) {
          await ctx.reply({
            content: '❌ Please specify a listing ID to buy: `/market action:buy listing_id:<id>`',
          });
          return;
        }

        try {
          const result = await marketService.buyListing({
            listingId,
            buyerUserId: ctx.user.id,
          });

          const embed = new EmbedBuilder()
            .setColor(0x57f287)
            .setTitle('🎉 Card Purchased Successfully!')
            .setDescription(
              `You purchased listing \`${result.listing.id}\` for **${result.netPaid.toLocaleString()} Credits**!\n\n` +
                `**Card ID**: \`${result.listing.userCardId}\`\n` +
                `**Market Tax Sink**: ${result.taxDeducted.toLocaleString()} Credits\n\n` +
                `The card has been transferred to your inventory and is ready in **IDLE** state.`,
            )
            .setFooter({ text: 'Ririko Player Marketplace • Atomic Transfer' })
            .setTimestamp();

          await ctx.reply({ embeds: [embed] });
        } catch (error) {
          await ctx.reply({
            content: `❌ ${error instanceof Error ? error.message : String(error)}`,
          });
        }
        return;
      }

      if (action === 'cancel') {
        const listingId = ctx.options.getString('listing_id') ?? rawArgs[1];
        if (!listingId) {
          await ctx.reply({
            content:
              '❌ Please specify a listing ID to cancel: `/market action:cancel listing_id:<id>`',
          });
          return;
        }

        try {
          await marketService.cancelListing({
            listingId,
            sellerUserId: ctx.user.id,
          });

          await ctx.reply({
            content: `🛑 Listing \`${listingId}\` has been cancelled. Your card has been returned to **IDLE** state in your inventory.`,
          });
        } catch (error) {
          await ctx.reply({
            content: `❌ ${error instanceof Error ? error.message : String(error)}`,
          });
        }
        return;
      }

      if (action === 'my-listings') {
        try {
          const myListings = await marketService.getUserListings(ctx.user.id);
          const activeListings = myListings.filter((l: MarketListing) => l.status === 'ACTIVE');

          if (activeListings.length === 0) {
            await ctx.reply({
              content:
                'ℹ️ You currently have no active listings. List a card with `/market action:list card_id:<id> price:<credits>`.',
            });
            return;
          }

          const embed = new EmbedBuilder()
            .setColor(0x5865f2)
            .setTitle('🛒 Your Active Marketplace Listings')
            .setDescription(
              activeListings
                .map(
                  (l: MarketListing) =>
                    `• **ID**: \`${l.id}\` | Card: \`${l.userCardId}\`\n` +
                    `  Price: **${l.price.toLocaleString()} Credits** (Tax: ${l.taxPaid} Credits)\n` +
                    `  Expires: <t:${Math.floor(new Date(l.expiresAt).getTime() / 1000)}:R>\n` +
                    `  *Cancel: \`/market action:cancel listing_id:${l.id}\`*`,
                )
                .join('\n\n'),
            )
            .setFooter({ text: 'Ririko Player Marketplace' })
            .setTimestamp();

          await ctx.reply({ embeds: [embed] });
        } catch (error) {
          await ctx.reply({
            content: `❌ ${error instanceof Error ? error.message : String(error)}`,
          });
        }
        return;
      }

      // Default: browse listings
      const page = ctx.options.getInteger('page') ?? (rawArgs[1] ? parseInt(rawArgs[1], 10) : 1);
      try {
        const result = await marketService.browseListings({ page, limit: 8 });

        if (result.listings.length === 0) {
          await ctx.reply({
            content:
              'ℹ️ The marketplace has no active listings right now. Be the first to list a card with `/market action:list`!',
          });
          return;
        }

        const embed = new EmbedBuilder()
          .setColor(0x5865f2)
          .setTitle('🏪 Community Player Marketplace')
          .setDescription(
            `Showing **${result.total}** active listings (Page ${result.page}/${result.totalPages}):\n\n` +
              result.listings
                .map((item: EnrichedMarketListing) => {
                  const card = item.cardInfo;
                  const name = card?.name ?? 'Unknown Card';
                  const rarity = card?.rarity ?? 'COMMON';
                  const element = card?.element ?? 'NEUTRAL';
                  const price = item.listing.price.toLocaleString();
                  return (
                    `• **${name}** [${rarity} | ${element}] (Lv.${item.userCard.level})\n` +
                    `  Price: **${price} Credits** | Seller: <@${item.listing.sellerUserId}>\n` +
                    `  *Buy: \`/market action:buy listing_id:${item.listing.id}\`*`
                  );
                })
                .join('\n\n'),
          )
          .setFooter({ text: 'Ririko Player Marketplace • 5% Market Tax Sink' })
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
