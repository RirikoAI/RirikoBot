import { Injectable } from '@nestjs/common';
import { ReactBase } from './class/ReactBase.class';
import { SlashCommandOptionTypes } from '#command/command.types';

@Injectable()
export default class WinkCommand extends ReactBase {
  name = 'wink';
  regex = new RegExp('^wink$|^wink ', 'i');
  description = 'Flash a playful or flirty wink at someone.';
  category = 'reactions';
  usageExamples = ['wink @user'];
  reactionType = 'wink';
  content = 'gave a wink to';
  noTargetContent = 'winked at their reflection in the mirror, feeling cheeky';

  slashOptions = [
    {
      name: 'target',
      description: 'The person you want to charm with a wink.',
      type: SlashCommandOptionTypes.User,
      required: false,
    },
  ];
}
