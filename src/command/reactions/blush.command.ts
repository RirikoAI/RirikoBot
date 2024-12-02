import { Injectable } from '@nestjs/common';
import { ReactBase } from './class/ReactBase.class';
import { SlashCommandOptionTypes } from '#command/command.types';

@Injectable()
export default class BlushCommand extends ReactBase {
  name = 'blush';
  regex = new RegExp('^blush$|^blush ', 'i');
  description = 'Turn as red as a tomato because someone caught you off guard.';
  category = 'reactions';
  usageExamples = ['blush @user'];
  reactionType = 'blush';
  content = 'turned bright red while blushing at';
  noTargetContent = 'turned bright red while blushing shyly to themselves';

  slashOptions = [
    {
      name: 'target',
      description: 'The certain someone who made your cheeks go red.',
      type: SlashCommandOptionTypes.User,
      required: false,
    },
  ];
}
