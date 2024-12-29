import { Injectable } from '@nestjs/common';
import { ReactBase } from './class/ReactBase.class';
import { SlashCommandOptionTypes } from '#command/command.types';

@Injectable()
export default class PeekCommand extends ReactBase {
  name = 'peek';
  regex = new RegExp('^peek$|^peek ', 'i');
  description = 'Sneak a shy or curious peek at someone.';
  category = 'reactions';
  usageExamples = ['peek @user'];
  reactionType = 'peek';
  content = 'peeked curiously at';
  noTargetContent = 'peeked around the corner cautiously, seeing nothing but their own shadow';

  slashOptions = [
    {
      name: 'target',
      description: 'The person you want to sneak a peek at.',
      type: SlashCommandOptionTypes.User,
      required: false,
    },
  ];
}
