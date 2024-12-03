import { Injectable } from '@nestjs/common';
import { ReactBase } from './class/ReactBase.class';
import { SlashCommandOptionTypes } from '#command/command.types';

@Injectable()
export default class ShrugCommand extends ReactBase {
  name = 'shrug';
  regex = new RegExp('^shrug$|^shrug ', 'i');
  description = 'Shrug at someone with a mix of indifference, confusion, or playfulness.';
  category = 'reactions';
  usageExamples = ['shrug @user'];
  reactionType = 'shrug';
  content = 'shrugged nonchalantly at';
  noTargetContent = 'shrugged to themselves, as if the universe’s mysteries didn’t concern them';

  slashOptions = [
    {
      name: 'target',
      description: 'The person you want to shrug at.',
      type: SlashCommandOptionTypes.User,
      required: false,
    },
  ];
}
