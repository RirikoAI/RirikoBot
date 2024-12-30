import { Injectable } from '@nestjs/common';
import { ReactBase } from './class/ReactBase.class';
import { SlashCommandOptionTypes } from '#command/command.types';

@Injectable()
export default class CuddleCommand extends ReactBase {
  name = 'cuddle';
  regex = new RegExp('^cuddle$|^cuddle ', 'i');
  description = 'Wrap someone in a warm and loving cuddle to show you care.';
  category = 'reactions';
  usageExamples = ['cuddle @user'];
  reactionType = 'cuddle';
  content = 'snuggled up close to';
  noTargetContent =
    'wrapped themselves in a cozy blanket for some self-love snuggles';

  slashOptions = [
    {
      name: 'target',
      description: 'The lucky person you want to share a cozy cuddle with.',
      type: SlashCommandOptionTypes.User,
      required: false,
    },
  ];
}
