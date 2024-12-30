import { Injectable } from '@nestjs/common';
import { ReactBase } from './class/ReactBase.class';
import { SlashCommandOptionTypes } from '#command/command.types';

@Injectable()
export default class TickleCommand extends ReactBase {
  name = 'tickle';
  regex = new RegExp('^tickle$|^tickle ', 'i');
  description = 'Give someone a playful tickle to make them laugh!';
  category = 'reactions';
  usageExamples = ['tickle @user'];
  reactionType = 'tickle';
  content = 'playfully tickled';
  noTargetContent =
    'wiggled their fingers in the air, pretending to tickle an invisible friend';

  slashOptions = [
    {
      name: 'target',
      description: 'The person you want to make giggle with a playful tickle.',
      type: SlashCommandOptionTypes.User,
      required: false,
    },
  ];
}
