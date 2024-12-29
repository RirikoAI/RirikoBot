import { Injectable } from '@nestjs/common';
import { ReactBase } from './class/ReactBase.class';
import { SlashCommandOptionTypes } from '#command/command.types';

@Injectable()
export default class AngryStareCommand extends ReactBase {
  name = 'angrystare';
  regex = new RegExp('^angrystare$|^angrystare ', 'i');
  description = 'Fix someone with a stare so fiery it could melt steel.';
  category = 'reactions';
  usageExamples = ['angrystare @user'];
  reactionType = 'angrystare';
  content = 'locked an angry stare on';
  noTargetContent = 'stared angrily into the void, radiating fiery frustration';

  slashOptions = [
    {
      name: 'target',
      description: 'The person who made you burn with fury.',
      type: SlashCommandOptionTypes.User,
      required: false,
    },
  ];
}
