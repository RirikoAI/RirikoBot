import { Injectable } from '@nestjs/common';
import { ReactBase } from './class/ReactBase.class';
import { SlashCommandOptionTypes } from '#command/command.types';

@Injectable()
export default class SighCommand extends ReactBase {
  name = 'sigh';
  regex = new RegExp('^sigh$|^sigh ', 'i');
  description = 'Let out a deep sigh of exasperation, relief, or melancholy.';
  category = 'reactions';
  usageExamples = ['sigh @user'];
  reactionType = 'sigh';
  content = 'let out a heavy sigh while looking at';
  noTargetContent = 'let out a deep sigh, staring into the distance with a wistful expression';

  slashOptions = [
    {
      name: 'target',
      description: 'The person who made you sigh deeply.',
      type: SlashCommandOptionTypes.User,
      required: false,
    },
  ];
}
