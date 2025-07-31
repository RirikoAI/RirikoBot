import { Injectable } from '@nestjs/common';
import { EconomyExtension } from '#economy/extension.class';
import { EconomyUtil } from '#util/economy/economy.util';
import { DiscordMessage } from '#command/command.types';
import { StringUtil } from '#util/string/string.util';

@Injectable()
export class KarmaExtension extends EconomyExtension {
  async rewardUserForMessage(message: DiscordMessage): Promise<any> {
    const isGibberish = StringUtil.isGibberish(message);

    if (isGibberish) return;

    let user = await this.extensions.profile.getUser(message.author);

    // get the user exp or karma
    let karma = user.karma;

    // get the user coins
    let coins = user.coins;

    // check if the message has more than 10 words
    const words = message.content.split(' ');
    if (words.length < 10) {
      // console.log(`${message.author.username} has earned: 1 point`);
      karma++;
      coins++;
    } else {
      // console.log(`${message.author.username} has earned: 2 point`);
      karma += 2;
      coins += 2;
    }

    let userLevel = EconomyUtil.getCurrentLevel(karma);

    const guildDB = await this.db.guildRepository.findOne({
      where: { id: message.guild.id },
    });

    let config = guildDB.configurations.find(
      (c) => c.name === 'karma-notification-enabled',
    );

    if (config && config.value !== 'disabled') {
      // check if the user has leveled up
      if (userLevel > EconomyUtil.getCurrentLevel(user.karma)) {
        if (!user.doNotNotifyOnLevelUp) {
          // console.log(`${message.author.username} has leveled up!`);
          // DM the member that they have leveled up
          await message.author.send(
            `Congratulations! You have leveled up to level ${userLevel} in the server: ${message.guild.name}`,
          );
          // send a message to the channel
          await message.channel.send(
            `Congratulations to <@${message.author.id}> for leveling up to level ${userLevel}!`,
          );
        }
      }
    }

    // update the user karma and coins
    user.karma = karma;
    user.coins = coins;
    await this.db.userRepository.save(user);
    // console.log('User level:', userLevel, 'User Karma:', karma);
  }
}
