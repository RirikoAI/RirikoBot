import { Injectable } from '@nestjs/common';
import { ReactBase } from './class/ReactBase.class';
import { SlashCommandOptionTypes } from '#command/command.types';

@Injectable()
export default class BrofistCommand extends ReactBase {
  name = 'brofist';
  regex = new RegExp('^brofist$|^brofist ', 'i');
  description = 'Send an epic brofist to show some solidarity or camaraderie.';
  category = 'reactions';
  usageExamples = ['brofist @user'];
  reactionType = 'brofist';
  content = 'threw a legendary brofist at';
  noTargetContent =
    'threw a brofist into the air, radiating pure camaraderie to everyone and no one';

  slashOptions = [
    {
      name: 'target',
      description: 'The legend you want to share an epic brofist with.',
      type: SlashCommandOptionTypes.User,
      required: false,
    },
  ];
}
