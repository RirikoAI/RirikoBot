import { Injectable } from '@nestjs/common';
import { ReactBase } from './class/ReactBase.class';
import { SlashCommandOptionTypes } from '#command/command.types';

@Injectable()
export default class RunCommand extends ReactBase {
  name = 'run';
  regex = new RegExp('^run$|^run ', 'i');
  description = 'Dash away from someone with panic!';
  category = 'reactions';
  usageExamples = ['run @user'];
  reactionType = 'run';
  content = 'ran away from';
  noTargetContent = 'bolted off in a random direction, running from their own imagination';

  slashOptions = [
    {
      name: 'target',
      description: 'The person you want to run away from.',
      type: SlashCommandOptionTypes.User,
      required: false,
    },
  ];
}
