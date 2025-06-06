import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { EmbedBuilder } from 'discord.js';
import { SteamGame } from '#free-games/free-games.type';
import * as cheerio from 'cheerio';

/**
 * FreeGamesService
 * @description Service to fetch free games from Epic Games Store and Steam
 * @author AI Assistant
 */
@Injectable()
export class FreeGamesService {
  private readonly logger = new Logger(FreeGamesService.name);

  /**
   * Fetch free games from Epic Games Store
   * @returns Array of free games from Epic Games Store
   */
  async getEpicFreeGames(): Promise<any[]> {
    try {
      // Epic Games Store API endpoint
      const response = await axios.get(
        'https://store-site-backend-static.ak.epicgames.com/freeGamesPromotions',
      );

      const games = response.data?.data?.Catalog?.searchStore?.elements || [];

      // Filter for free games
      return games.filter((game) => {
        // Check if the game is free
        const promotions = game.promotions;
        if (!promotions) return false;

        const promotionalOffers = promotions.promotionalOffers || [];
        const upcomingPromotionalOffers =
          promotions.upcomingPromotionalOffers || [];

        // Check if the game is currently free
        const isCurrentlyFree = promotionalOffers.some((offer) =>
          offer.promotionalOffers?.some(
            (promo) => promo.discountSetting?.discountPercentage === 0,
          ),
        );

        // Check if the game will be free soon
        const willBeFree = upcomingPromotionalOffers.some((offer) =>
          offer.promotionalOffers?.some(
            (promo) => promo.discountSetting?.discountPercentage === 0,
          ),
        );

        if (willBeFree) {
          // add to the game title (Coming Soon)
          game.title += ' (Coming Soon)';
        }

        return isCurrentlyFree || willBeFree;
      });
    } catch (error) {
      this.logger.error(`Error fetching Epic free games: ${error.message}`);
      return [];
    }
  }

  /**
   * Fetch free games from Steam
   * @returns Array of free games from Steam
   */
  async getSteamFreeGames(): Promise<SteamGame[]> {
    try {
      const response = await axios.get<String>(
        'https://store.steampowered.com/search/results',
        {
          params: {
            query: '',
            start: 0,
            count: 50,
            maxprice: 'free',
            specials: 1,
            hidef2p: 1,
            ndl: 1,
            supportedlang: 'english',
          },
          headers: {
            'User-Agent':
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
          },
        },
      );

      const html: any = response.data;
      const $ = cheerio.load(html);
      const games: SteamGame[] = [];

      $('#search_resultsRows a.search_result_row').each((_, el) => {
        const url = $(el).attr('href');
        const name = $(el).find('.title').text().trim();

        if (url && name) {
          games.push({ name, url });
        }
      });

      return games;
    } catch (error) {
      console.error('Error fetching Steam games:', error);
      return [];
    }
  }

  /**
   * Create an embed for free games
   * @param games Array of free games
   * @param source Source of the games (Epic or Steam)
   * @returns Discord embed
   */
  createFreeGamesEmbed(games: any[], source: 'Epic' | 'Steam'): EmbedBuilder {
    const embed = new EmbedBuilder()
      .setColor('#0099ff')
      .setTitle(`Free Games on ${source}`)
      .setDescription(`Here are the current free games on ${source}:`)
      .setTimestamp()
      .setFooter({
        text: `Made with ❤️ by Ririko`,
      });

    if (games.length === 0) {
      embed.setDescription(`No free games found on ${source} at the moment.`);
      return embed;
    }

    // Add fields for each game
    games.forEach((game) => {
      if (source === 'Epic') {
        embed.addFields({
          name: game.title,
          value: `[View in Store](https://www.epicgames.com/store/en-US/p/${game.productSlug || game.urlSlug})`,
        });
      } else {
        embed.addFields({
          name: game.name,
          value: `[View in Store](${game.url})`,
        });
      }
    });

    return embed;
  }
}
