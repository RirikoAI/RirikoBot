import { Injectable } from '@nestjs/common';
import { EconomyExtension } from '#economy/extension.class';
import { RankCardBuilder } from 'discord-card-canvas';
import { GuildTextBasedChannel, User } from 'discord.js';
import { DiscordInteraction, DiscordMessage } from '#command/command.types';
import { EconomyUtil } from '#util/economy/economy.util';

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
    let canvasRank = await new RankCardBuilder({
      currentLvl: EconomyUtil.getCurrentLevel(userDB.karma),
      currentRank: 'A' as any, // TODO! Implement rank system
      currentXP: userDB.karma,
      requiredXP: parseInt(
        String(EconomyUtil.calculateTotalExpForLevel(currentLevel + 1)),
      ),
      backgroundColor: { background: '#0d0112', bubbles: '#0060ff' },
      // backgroundImgURL: 'any_image.png',
      avatarImgURL: user.displayAvatarURL({ extension: 'png', size: 512 }),
      nicknameText: {
        content: user.displayName,
        font: 'Nunito',
        color: '#ffffff',
      },
      userStatus: guildUser.presence.status,
    })
      .setRankPrefix({
        content: 'Rank',
      })
      // .setAvatarBackgroundColor('#b81d84')
      // .setColorTextDefault('#ff00e1')
      .setLvlPrefix({
        content: 'Level',
      });

    // canvasRank.progressBarColor = '#ff00e1';
    // canvasRank.currentXPColor = '#ff00e1';
    // canvasRank.requiredXPColor = '#7F8384';

    const canvas = await canvasRank.build();

    // // Saving an image
    // fs.writeFileSync('rank_blue.png', canvasRank.toBuffer());

    await message.reply({
      files: [{ attachment: canvas.toBuffer(), name: 'rank.png' }],
    });
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
