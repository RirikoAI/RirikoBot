import { Injectable } from '@nestjs/common';
import { ReactBase } from './class/ReactBase.class';
import { SlashCommandOptionTypes } from '#command/command.types';

@Injectable()
export default class NyahCommand extends ReactBase {
  name = 'nyah';
  regex = new RegExp('^nyah$|^nyah ', 'i');
  description = 'Let out a cute "nyah~" to tease or charm someone.';
  category = 'reactions';
  usageExamples = ['nyah @user'];
  reactionType = 'nyah';
  content = 'teased with a playful "nyah~" at';
  noTargetContent = 'let out a cute "nyah~" to the world, feeling delightfully mischievous';

  slashOptions = [
    {
      name: 'target',
      description: 'The person you want to charm or tease with a "nyah~".',
      type: SlashCommandOptionTypes.User,
      required: false,
    },
  ];
}
