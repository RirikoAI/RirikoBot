import { Injectable } from '@nestjs/common';
import { ReactBase } from './class/ReactBase.class';
import { SlashCommandOptionTypes } from '#command/command.types';

@Injectable()
export default class TiredCommand extends ReactBase {
  name = 'tired';
  regex = new RegExp('^tired$|^tired ', 'i');
  description = 'Show someone just how exhausted you are.';
  category = 'reactions';
  usageExamples = ['tired @user'];
  reactionType = 'tired';
  content = 'looked utterly tired while glancing at';
  noTargetContent = 'rubbed their eyes and let out a deep yawn, looking completely drained';

  slashOptions = [
    {
      name: 'target',
      description: 'The person who can see how drained you feel.',
      type: SlashCommandOptionTypes.User,
      required: false,
    },
  ];
}
