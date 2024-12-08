import { Command } from '#command/command.class';
import { CommandInterface } from '#command/command.interface';

export default class SetupStableDiffusionApiCommand
  extends Command
  implements CommandInterface
{
  name = 'setup-stablediffusion-api';
  regex = new RegExp(
    '^setup-stablediffusion-api$|^setup-stablediffusion-api ',
    'i',
  );
  description = 'Setup StableDiffusion API';
  category = 'stablediffusion';
  usageExamples = ['setup-stablediffusion-api --api-token <api-token>'];

  async runCli(input: string): Promise<any> {
    const args = this.parseCliArgs(input);
    if (!args['api-token']) {
      console.error(
        'API Token is required\n   Example: setup-stablediffusion-api --api-token <api-token>',
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
        stableDiffusionApiToken: args['api-token'],
      });
    } else {
      config.stableDiffusionApiToken = args['api-token'];
      await this.db.configRepository.save(config);
    }

    console.log('StableDiffusion API has been set for this bot: ');
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
