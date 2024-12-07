import { Command } from '#command/command.class';
import { CommandInterface } from '#command/command.interface';
import { Logger } from '@nestjs/common';

export default class SetupApiCommand
  extends Command
  implements CommandInterface
{
  name = 'setup-twitch-api';
  regex = new RegExp('^setup-twitch-api$|^setup-twitch-api ', 'i');
  description = 'Setup Twitch API';
  category = 'twitch';
  usageExamples = [
    'setup-twitch-api --client-id <client-id> --client-secret <client-secret>',
  ];

  async runCli(input: string): Promise<any> {
    const args = this.parseCliArgs(input);

    if (!args['client-id'] || !args['client-secret']) {
      Logger.error(
        'Client ID and Client Secret are required\n   Example: setup-twitch-api --client-id <client-id> --client-secret <client-secret>',
      );
      return;
    }

    let config = await this.db.configRepository.findOne({
      where: {
        applicationId: process.env.DISCORD_APPLICATION_ID,
      },
    });

    if (!config) {
      await this.db.configRepository.create({
        applicationId: process.env.DISCORD_APPLICATION_ID,
        twitchClientId: args['client-id'],
        twitchClientSecret: args['client-secret'],
      });
    } else {
      config.twitchClientId = args['client-id'];
      config.twitchClientSecret = args['client-secret'];
      await this.db.configRepository.save(config);
    }

    console.log('Twitch API has been set for this bot: ');
    console.log(args);
  }

  parseCliArgs(input: string): Record<string, string> {
    const args = input.split('--').slice(1);
    const result: Record<string, string> = {};

    args.forEach((arg) => {
      const [key, value] = arg.split(' ');
      result[key] = value;
    });

    return result;
  }
}
