import { Injectable } from '@nestjs/common';
import { ReactBase } from './class/ReactBase.class';
import { SlashCommandOptionTypes } from '#command/command.types';

@Injectable()
export default class LoveCommand extends ReactBase {
  name = 'love';
  regex = new RegExp('^love$|^love ', 'i');
  description = 'Express your love and affection for someone special.';
  category = 'reactions';
  usageExamples = ['love @user'];
  reactionType = 'love';
  content = 'shared heartfelt love with';
  noTargetContent =
    'sent love into the world, embracing their own heart with warmth';

  slashOptions = [
    {
      name: 'target',
      description: 'The person you want to shower with love.',
      type: SlashCommandOptionTypes.User,
      required: false,
    },
  ];
}
