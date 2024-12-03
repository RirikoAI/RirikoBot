import { Injectable } from '@nestjs/common';
import { ReactBase } from './class/ReactBase.class';
import { SlashCommandOptionTypes } from '#command/command.types';

@Injectable()
export default class ShyCommand extends ReactBase {
  name = 'shy';
  regex = new RegExp('^shy$|^shy ', 'i');
  description = 'Blush and act shy around someone, avoiding eye contact.';
  category = 'reactions';
  usageExamples = ['shy @user'];
  reactionType = 'shy';
  content = 'acted shy around';
  noTargetContent = 'is being shy of everyone';

  slashOptions = [
    {
      name: 'target',
      description: 'The person who makes you feel bashful and shy.',
      type: SlashCommandOptionTypes.User,
      required: false,
    },
  ];
}
