import { Injectable } from '@nestjs/common';
import { ReactBase } from './class/ReactBase.class';
import { SlashCommandOptionTypes } from '#command/command.types';

@Injectable()
export default class PokeCommand extends ReactBase {
  name = 'poke';
  regex = new RegExp('^poke$|^poke ', 'i');
  description = 'Poke someone to grab their attention or just for fun!';
  category = 'reactions';
  usageExamples = ['poke @user'];
  reactionType = 'poke';
  content = 'gently poked';
  noTargetContent = 'poked the air aimlessly, hoping someone might notice';

  slashOptions = [
    {
      name: 'target',
      description: 'The person you want to poke.',
      type: SlashCommandOptionTypes.User,
      required: false,
    },
  ];
}
