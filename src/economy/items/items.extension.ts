import { Injectable } from '@nestjs/common';
import { EconomyExtension } from '#economy/extension.class';

@Injectable()
export class ItemsExtension extends EconomyExtension {
  async findRandomItems(userId): Promise<any> {
    console.log('Finding random items for user', userId);
    if (Math.random() < 50 / 100) {
      // 2% chance of finding an item
      console.log(`${userId} found an item!`);
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
      const rarity = Math.floor(Math.random() * 100.0 + 0.01);
      //
      let item;
      if (rarity < 48) {
        item = 'Trash';
      } else if (rarity < 78) {
        item = 'Common';
      } else if (rarity < 88) {
        item = 'Uncommon';
      } else if (rarity < 93) {
        item = 'Rare';
      } else if (rarity < 96) {
        item = 'Ultra Rare';
      } else if (rarity < 98) {
        item = 'Epic';
      } else if (rarity < 99) {
        item = 'Legendary';
      } else if (rarity < 99.8) {
        item = 'Mythical';
      } else {
        item = 'Godly';
      }

      console.log(`${userId} found a ${item} item at ${rarity} rarity`);
    }
  }
}
