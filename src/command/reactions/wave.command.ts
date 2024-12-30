import { Injectable } from '@nestjs/common';
import { ReactBase } from './class/ReactBase.class';
import { SlashCommandOptionTypes } from '#command/command.types';

@Injectable()
export default class WaveCommand extends ReactBase {
  name = 'wave';
  regex = new RegExp('^wave$|^wave ', 'i');
  description = 'Greet someone with a friendly wave!';
  category = 'reactions';
  usageExamples = ['wave @user'];
  reactionType = 'wave';
  content = 'waved cheerfully at';
  noTargetContent =
    'waved enthusiastically at no one in particular, spreading good vibes';

  slashOptions = [
    {
      name: 'target',
      description: 'The person you want to greet with a warm wave.',
      type: SlashCommandOptionTypes.User,
      required: false,
    },
  ];
}
