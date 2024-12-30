import { Injectable } from '@nestjs/common';
import { ReactBase } from './class/ReactBase.class';
import { SlashCommandOptionTypes } from '#command/command.types';

@Injectable()
export default class DanceCommand extends ReactBase {
  name = 'dance';
  regex = new RegExp('^dance$|^dance ', 'i');
  description =
    'Bust out some moves alone or invite someone to join the party!';
  category = 'reactions';
  usageExamples = ['dance @user'];
  reactionType = 'dance';
  content = 'twirled and danced with';
  noTargetContent = 'spun around joyfully, dancing like nobody was watching';

  slashOptions = [
    {
      name: 'target',
      description: 'The person you want to groove with on the dance floor.',
      type: SlashCommandOptionTypes.User,
      required: false,
    },
  ];
}
