import { Injectable, Logger } from '@nestjs/common';
import { EconomyExtension } from '#economy/extension.class';
import { Guild, User } from 'discord.js';

@Injectable()
export class ItemsExtension extends EconomyExtension {
  async findRandomItems(user: User, guild: Guild): Promise<any> {
    if (Math.random() < 10 / 100) {
      // 2% chance of finding an item
      Logger.log(
        `${user.tag} found an item in ${guild.name}!`,
        'Ririko Economy',
      );
      /**
       * Rarity  Name  Chance
       * 0  Trash  48%
       * 1  Common  30%
       * 2  Uncommon  10%
       * 3  Rare  5%
       * 4  Ultra Rare  3%
       * 5  Epic  2%
       * 6  Legendary  1%
       * 7  Mythical  0.9%
       * 8  Godly  0.1%
       */
      const roll = Math.floor(Math.random() * 100.0 + 0.01);
      //
      let item;
      if (roll < 48) {
        item = 'Trash';
      } else if (roll < 78) {
        item = 'Common';
      } else if (roll < 88) {
        item = 'Uncommon';
      } else if (roll < 93) {
        item = 'Rare';
      } else if (roll < 96) {
        item = 'Ultra Rare';
      } else if (roll < 98) {
        item = 'Epic';
      } else if (roll < 99) {
        item = 'Legendary';
      } else if (roll < 99.8) {
        item = 'Mythical';
      } else {
        item = 'Godly';
      }

      Logger.log(
        `${user.tag} found a ${item} item at ${roll} rarity`,
        'Ririko Economy',
      );

      // TODO! Add an item with that rarity to the user's inventory
    }
  }
}
