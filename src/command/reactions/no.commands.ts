import { Injectable } from '@nestjs/common';
import { ReactBase } from './class/ReactBase.class';
import { SlashCommandOptionTypes } from '#command/command.types';

@Injectable()
export default class NoCommand extends ReactBase {
  name = 'no';
  regex = new RegExp('^no$|^no ', 'i');
  description = 'Firmly reject or refuse someone’s actions or words.';
  category = 'reactions';
  usageExamples = ['no @user'];
  reactionType = 'no';
  content = 'shook their head and said no to';
  noTargetContent = 'crossed their arms and said a firm "No!" to the universe';

  slashOptions = [
    {
      name: 'target',
      description: 'The person you want to emphatically say no to.',
      type: SlashCommandOptionTypes.User,
      required: false,
    },
  ];
}
