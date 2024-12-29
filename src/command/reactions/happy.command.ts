import { Injectable } from '@nestjs/common';
import { ReactBase } from './class/ReactBase.class';
import { SlashCommandOptionTypes } from '#command/command.types';

@Injectable()
export default class HappyCommand extends ReactBase {
  name = 'happy';
  regex = new RegExp('^happy$|^happy ', 'i');
  description = 'Spread joy and share a moment of happiness with someone special!';
  category = 'reactions';
  usageExamples = ['happy @user'];
  reactionType = 'happy';
  content = 'shared a joyful moment with';
  noTargetContent = 'smiled brightly to themselves, radiating happiness in their own little bubble';

  slashOptions = [
    {
      name: 'target',
      description: 'The lucky person you want to spread your happiness to.',
      type: SlashCommandOptionTypes.User,
      required: false,
    },
  ];
}
