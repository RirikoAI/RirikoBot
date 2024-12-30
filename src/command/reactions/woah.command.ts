import { Injectable } from '@nestjs/common';
import { ReactBase } from './class/ReactBase.class';
import { SlashCommandOptionTypes } from '#command/command.types';

@Injectable()
export default class WoahCommand extends ReactBase {
  name = 'woah';
  regex = new RegExp('^woah$|^woah ', 'i');
  description = 'Express amazement or surprise at someone.';
  category = 'reactions';
  usageExamples = ['woah @user'];
  reactionType = 'woah';
  content = 'was amazed by';
  noTargetContent = 'stared wide-eyed, muttering a stunned "Woah..."';

  slashOptions = [
    {
      name: 'target',
      description: 'The person that left you amazed.',
      type: SlashCommandOptionTypes.User,
      required: false,
    },
  ];
}
