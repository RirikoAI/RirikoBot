import { Injectable } from '@nestjs/common';
import { ReactBase } from './class/ReactBase.class';
import { SlashCommandOptionTypes } from '#command/command.types';

@Injectable()
export default class LaughCommand extends ReactBase {
  name = 'laugh';
  regex = new RegExp('^laugh$|^laugh ', 'i');
  description = 'Burst into laughter and share the joy with someone.';
  category = 'reactions';
  usageExamples = ['laugh @user'];
  reactionType = 'laugh';
  content = 'laughed heartily with';
  noTargetContent = 'burst into uncontrollable laughter';

  slashOptions = [
    {
      name: 'target',
      description:
        'The person you want to laugh with or at (in good spirit, of course!).',
      type: SlashCommandOptionTypes.User,
      required: false,
    },
  ];
}
