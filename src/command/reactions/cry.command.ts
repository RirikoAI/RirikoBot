import { Injectable } from '@nestjs/common';
import { ReactBase } from './class/ReactBase.class';
import { SlashCommandOptionTypes } from '#command/command.types';

@Injectable()
export default class CryCommand extends ReactBase {
  name = 'cry';
  regex = new RegExp('^cry$|^cry ', 'i');
  description = 'Let the tears flow because someone tugged at your heartstrings or hurt your feelings.';
  category = 'reactions';
  usageExamples = ['cry @user'];
  reactionType = 'cry';
  content = 'shed tears because of';
  noTargetContent = 'shed tears quietly, feeling the weight of their emotions alone';

  slashOptions = [
    {
      name: 'target',
      description: 'The heartless (or maybe misunderstood) person who made you cry.',
      type: SlashCommandOptionTypes.User,
      required: false,
    },
  ];
}
