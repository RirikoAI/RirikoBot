import { Injectable } from '@nestjs/common';
import { ReactBase } from './class/ReactBase.class';
import { SlashCommandOptionTypes } from '#command/command.types';

@Injectable()
export default class StopCommand extends ReactBase {
  name = 'stopit';
  regex = new RegExp('^stopit$|^stopit ', 'i');
  description = 'Tell someone to halt or cease whatever they’re doing.';
  category = 'reactions';
  usageExamples = ['stopit @user'];
  reactionType = 'stop';
  content = 'firmly demanded a stop from';
  noTargetContent =
    'held up a hand and shouted "Stop!" into the empty air, standing their ground';

  slashOptions = [
    {
      name: 'target',
      description: 'The person you want to tell to stop.',
      type: SlashCommandOptionTypes.User,
      required: false,
    },
  ];
}
