import { Injectable } from '@nestjs/common';
import { ReactBase } from './class/ReactBase.class';
import { SlashCommandOptionTypes } from '#command/command.types';

@Injectable()
export default class ScaredCommand extends ReactBase {
  name = 'scared';
  regex = new RegExp('^scared$|^scared ', 'i');
  description = 'Show someone just how spooked or terrified you are!';
  category = 'reactions';
  usageExamples = ['scared @user'];
  reactionType = 'scared';
  content = 'looked scared of';
  noTargetContent =
    'shivered nervously, looking around for imaginary monsters in the shadows';

  slashOptions = [
    {
      name: 'target',
      description: 'The person that has you trembling in fear.',
      type: SlashCommandOptionTypes.User,
      required: false,
    },
  ];
}
