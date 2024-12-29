import { Injectable } from '@nestjs/common';
import { ReactBase } from './class/ReactBase.class';
import { SlashCommandOptionTypes } from '#command/command.types';

@Injectable()
export default class NomCommand extends ReactBase {
  name = 'nom';
  regex = new RegExp('^nom$|^nom ', 'i');
  description = 'Give someone a playful nibble or pretend to eat them.';
  category = 'reactions';
  usageExamples = ['nom @user'];
  reactionType = 'nom';
  content = 'nommed';
  noTargetContent = 'pretended to nom the air, imagining an invisible snack';

  slashOptions = [
    {
      name: 'target',
      description: 'The person you want to nom on in a playful way.',
      type: SlashCommandOptionTypes.User,
      required: false,
    },
  ];
}
