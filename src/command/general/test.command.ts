import { CommandInterface } from '#command/command.interface';
import { Command } from '#command/command.class';
import { DiscordMessage } from '#command/command.types';
import { WelcomeCard } from '#util/banner/welcome-card.util';

export default class TestCommand extends Command implements CommandInterface {
  name = 'test';
  description = 'Test command';
  regex = new RegExp(`^test$`, 'i');
  usageExamples = ['test'];
  category = 'general';

  async runPrefix(message: DiscordMessage): Promise<void> {
    const welcomeCard = new WelcomeCard();
    const buffer = await welcomeCard.generate({
      displayName: message.member.displayName,
      avatarURL: message.member.displayAvatarURL({
        extension: 'png',
        size: 512,
      }),
      welcomeText: 'Welcome',
      backgroundColor: '#5ba642',
      backgroundColor2: '#026000',
      borderColor: '#00f400',
      borderColor2: '#003a00',
      bubblesColor: 'rgba(255, 255, 255, 0.5)',
      // backgroundImgURL: 'https://i.imgur.com/70gHapy.jpeg',
    });

    message.channel.send({
      content: `Welcome to the server, <@${message.author.id}>!`,
      files: [
        {
          attachment: buffer,
          name: 'welcome-card.png',
        },
      ],
    });

    const buffer2 = await welcomeCard.generate({
      displayName: message.member.displayName,
      avatarURL: message.member.displayAvatarURL({
        extension: 'png',
        size: 512,
      }),
      welcomeText: 'Good Bye',
      backgroundColor: '#ff9700',
      backgroundColor2: '#ff4700',
      borderColor: '#ff0000',
      borderColor2: '#970000',
      bubblesColor: 'rgba(255, 255, 255, 0.5)',
      // backgroundImgURL: 'https://i.imgur.com/70gHapy.jpeg',
    });

    message.channel.send({
      content: `Good bye, <@${message.author.id}>!`,
      files: [
        {
          attachment: buffer2,
          name: 'goodbye-card.png',
        },
      ],
    });
  }
}
