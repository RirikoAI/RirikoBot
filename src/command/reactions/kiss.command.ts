import { Injectable } from '@nestjs/common';
import { ReactBase } from './class/ReactBase.class';
import { SlashCommandOptionTypes } from '#command/command.types';

@Injectable()
export default class KissCommand extends ReactBase {
  name = 'kiss';
  regex = new RegExp('^kiss$|^kiss ', 'i');
  description = 'Plant a sweet kiss on someone to show your affection.';
  category = 'reactions';
  usageExamples = ['kiss @user'];
  reactionType = 'kiss';
  content = 'gave a sweet kiss to';
  noTargetContent = 'made a valiant effort trying to kiss themselves';

  slashOptions = [
    {
      name: 'target',
      description: 'The lucky person you want to share a kiss with.',
      type: SlashCommandOptionTypes.User,
      required: false,
    },
  ];
}
