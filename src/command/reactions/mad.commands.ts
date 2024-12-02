import { Injectable } from '@nestjs/common';
import { ReactBase } from './class/ReactBase.class';
import { SlashCommandOptionTypes } from '#command/command.types';

@Injectable()
export default class MadCommand extends ReactBase {
  name = 'mad';
  regex = new RegExp('^mad$|^mad ', 'i');
  description = 'Show your frustration or anger toward someone.';
  category = 'reactions';
  usageExamples = ['mad @user'];
  reactionType = 'mad';
  content = 'is very mad at';
  noTargetContent = 'crossed their arms and fumed silently, steaming like a kettle';

  slashOptions = [
    {
      name: 'target',
      description: 'The person who has pushed your buttons.',
      type: SlashCommandOptionTypes.User,
      required: false,
    },
  ];
}
