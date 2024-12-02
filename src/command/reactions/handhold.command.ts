import { Injectable } from '@nestjs/common';
import { ReactBase } from './class/ReactBase.class';
import { SlashCommandOptionTypes } from '#command/command.types';

@Injectable()
export default class HandholdCommand extends ReactBase {
  name = 'handhold';
  regex = new RegExp('^handhold$|^handhold ', 'i');
  description = 'Reach out and hold hands with someone special.';
  category = 'reactions';
  usageExamples = ['handhold @user'];
  reactionType = 'handhold';
  content = 'gently held hands with';
  noTargetContent = 'extended their hand into the air, wishing for someone to hold it';

  slashOptions = [
    {
      name: 'target',
      description: 'The special someone you want to share a tender handhold with.',
      type: SlashCommandOptionTypes.User,
      required: false,
    },
  ];
}
