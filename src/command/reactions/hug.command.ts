import { Injectable } from '@nestjs/common';
import { ReactBase } from './class/ReactBase.class';
import { SlashCommandOptionTypes } from '#command/command.types';

@Injectable()
export default class HugCommand extends ReactBase {
  name = 'hug';
  regex = new RegExp('^hug$|^hug ', 'i');
  description =
    'Wrap your arms around someone to show them some love and care!';
  category = 'reactions';
  usageExamples = ['hug @user'];
  reactionType = 'hug';
  content = 'wrapped themselves in a warm hug with';
  noTargetContent = 'wrapped themselves in a warm, self-comforting hug';

  slashOptions = [
    {
      name: 'target',
      description: 'The lucky person you want to share a heartfelt hug with.',
      type: SlashCommandOptionTypes.User,
      required: false,
    },
  ];
}
