import { Test, TestingModule } from '@nestjs/testing';
import { ItemsExtension } from './items.extension';
import { Logger } from '@nestjs/common';
import { Guild, User } from 'discord.js';

describe('ItemsExtension', () => {
  let itemsExtension: ItemsExtension;
  let user: User;
  let guild: Guild;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ItemsExtension],
    }).compile();

    itemsExtension = module.get<ItemsExtension>(ItemsExtension);
    user = { tag: 'testUser#1234' } as User;
    guild = { name: 'testGuild' } as Guild;
  });

  it('should log when an item is found', async () => {
    jest.spyOn(Math, 'random').mockReturnValue(0.01); // Force the random chance to be within the 2% range
    const logSpy = jest.spyOn(Logger, 'log');

    await itemsExtension.findRandomItems(user, guild);

    expect(logSpy).toHaveBeenCalledWith(
      `${user.tag} found an item in ${guild.name}!`,
      'Ririko Economy',
    );
  });

  describe('Rarity Tests', () => {
    it('should log a Trash item', async () => {
      jest
        .spyOn(Math, 'random')
        .mockReturnValueOnce(0.01)
        .mockReturnValueOnce(0.47);
      const logSpy = jest.spyOn(Logger, 'log');

      await itemsExtension.findRandomItems(user, guild);

      expect(logSpy).toHaveBeenCalledWith(
        `${user.tag} found a Trash item at 47 rarity`,
        'Ririko Economy',
      );
    });

    it('should log a Common item', async () => {
      jest
        .spyOn(Math, 'random')
        .mockReturnValueOnce(0.01)
        .mockReturnValueOnce(0.5);
      const logSpy = jest.spyOn(Logger, 'log');

      await itemsExtension.findRandomItems(user, guild);

      expect(logSpy).toHaveBeenCalledWith(
        `${user.tag} found a Common item at 50 rarity`,
        'Ririko Economy',
      );
    });

    it('should log an Uncommon item', async () => {
      jest
        .spyOn(Math, 'random')
        .mockReturnValueOnce(0.01)
        .mockReturnValueOnce(0.8);
      const logSpy = jest.spyOn(Logger, 'log');

      await itemsExtension.findRandomItems(user, guild);

      expect(logSpy).toHaveBeenCalledWith(
        `${user.tag} found a Uncommon item at 80 rarity`,
        'Ririko Economy',
      );
    });

    it('should log a Rare item', async () => {
      jest
        .spyOn(Math, 'random')
        .mockReturnValueOnce(0.01)
        .mockReturnValueOnce(0.9);
      const logSpy = jest.spyOn(Logger, 'log');

      await itemsExtension.findRandomItems(user, guild);

      expect(logSpy).toHaveBeenCalledWith(
        `${user.tag} found a Rare item at 90 rarity`,
        'Ririko Economy',
      );
    });

    it('should log an Ultra Rare item', async () => {
      jest
        .spyOn(Math, 'random')
        .mockReturnValueOnce(0.01)
        .mockReturnValueOnce(0.95);
      const logSpy = jest.spyOn(Logger, 'log');

      await itemsExtension.findRandomItems(user, guild);

      expect(logSpy).toHaveBeenCalledWith(
        `${user.tag} found a Ultra Rare item at 95 rarity`,
        'Ririko Economy',
      );
    });

    it('should log an Epic item', async () => {
      jest
        .spyOn(Math, 'random')
        .mockReturnValueOnce(0.01)
        .mockReturnValueOnce(0.97);
      const logSpy = jest.spyOn(Logger, 'log');

      await itemsExtension.findRandomItems(user, guild);

      expect(logSpy).toHaveBeenCalledWith(
        `${user.tag} found a Epic item at 97 rarity`,
        'Ririko Economy',
      );
    });

    it('should log a Legendary item', async () => {
      jest
        .spyOn(Math, 'random')
        .mockReturnValueOnce(0.01)
        .mockReturnValueOnce(0.98);
      const logSpy = jest.spyOn(Logger, 'log');

      await itemsExtension.findRandomItems(user, guild);

      expect(logSpy).toHaveBeenCalledWith(
        `${user.tag} found a Legendary item at 98 rarity`,
        'Ririko Economy',
      );
    });

    it('should log a Mythical item', async () => {
      jest
        .spyOn(Math, 'random')
        .mockReturnValueOnce(0.01)
        .mockReturnValueOnce(0.998);
      const logSpy = jest.spyOn(Logger, 'log');

      await itemsExtension.findRandomItems(user, guild);

      expect(logSpy).toHaveBeenCalledWith(
        `${user.tag} found a Mythical item at 99 rarity`,
        'Ririko Economy',
      );
    });

    it('should log a Godly item', async () => {
      jest
        .spyOn(Math, 'random')
        .mockReturnValueOnce(0.01)
        .mockReturnValueOnce(0.999999);
      const logSpy = jest.spyOn(Logger, 'log');

      await itemsExtension.findRandomItems(user, guild);

      expect(logSpy).toHaveBeenCalledWith(
        `${user.tag} found a Godly item at 100 rarity`,
        'Ririko Economy',
      );
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });
});
