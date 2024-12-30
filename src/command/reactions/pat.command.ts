import { Injectable } from '@nestjs/common';
import { ReactBase } from './class/ReactBase.class';
import { SlashCommandOptionTypes } from '#command/command.types';

@Injectable()
export default class PatCommand extends ReactBase {
  name = 'pat';
  regex = new RegExp('^pat$|^pat ', 'i');
  description =
    'Give someone a gentle pat on the head to show they’re appreciated!';
  category = 'reactions';
  usageExamples = ['pat @user'];
  reactionType = 'pat';
  content = 'gently patted';
  noTargetContent =
    'patted the air awkwardly, hoping someone would appear to receive it';

  slashOptions = [
    {
      name: 'target',
      description: 'The adorable person you want to give a comforting pat to.',
      type: SlashCommandOptionTypes.User,
      required: false,
    },
  ];
}
