import { Injectable } from '@nestjs/common';
import { EconomyExtension } from '#economy/extension.class';
import { GuildTextBasedChannel, User } from 'discord.js';
import { DiscordInteraction, DiscordMessage } from '#command/command.types';
import { EconomyUtil } from '#util/economy/economy.util';
import { Banner } from '#util/economy/banner.util';
import { BadgesUtil } from '#util/discord/badges.util';

@Injectable()
export class ProfileExtension extends EconomyExtension {
  async getProfile(
    user: User,
    channel: GuildTextBasedChannel,
    message: DiscordInteraction | DiscordMessage,
  ) {
    let userDB = await this.getUser(user);

    const guildUser = await message.guild.members.fetch(user.id);
    const currentLevel = EconomyUtil.getCurrentLevel(userDB.karma);

    const badges = await BadgesUtil.getBadges(user);

    let deferred;
    if ('deferReply' in message) {
      deferred = true;
      await message.deferReply();
    }

    const banner = new Banner();
    const buffer = await banner.generateBanner({
      displayName: user.displayName,
      avatarURL: user.displayAvatarURL({ extension: 'png', size: 512 }),
      presenceStatus: guildUser.presence?.status || 'offline',
      level: 'Level ' + currentLevel.toString(),
      currentExp: userDB.karma,
      requiredExp: parseInt(
        String(EconomyUtil.calculateTotalExpForLevel(currentLevel + 1)),
      ),
      backgroundImgURL: userDB.backgroundImageURL,
      backgroundImgBlur: 8,
      badges: badges,
    });

    if (deferred) {
      await (message as any).editReply({
        files: [{ attachment: buffer, name: 'rank.png' }],
      });
    } else {
      await message.reply({
        files: [{ attachment: buffer, name: 'rank.png' }],
      });
    }
  }

  async setBackgroundImageURL(user: User, url: string) {
    let userDB = await this.getUser(user);
    userDB.backgroundImageURL = url;
    await this.db.userRepository.save(userDB);
  }

  async getUser(user: User) {
    // get the user from db
    let userDB = await this.db.userRepository.findOne({
      where: {
        id: user.id,
      },
    });

    // if not found, create a new user
    if (!userDB) {
      userDB = await this.db.userRepository.save({
        id: user.id,
        username: user.username,
        displayName: user.displayName,
        karma: 0,
        createdAt: user.createdAt,
      });
    }

    return userDB;
  }
}
