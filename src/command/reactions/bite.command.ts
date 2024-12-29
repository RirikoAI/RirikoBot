import { Injectable } from '@nestjs/common';
import { ReactBase } from './class/ReactBase.class';
import { SlashCommandOptionTypes } from '#command/command.types';

@Injectable()
export default class BiteCommand extends ReactBase {
  name = 'bite';
  regex = new RegExp('^bite$|^bite ', 'i');
  description = 'Give someone a mischievous little nibble (or a playful chomp).';
  category = 'reactions';
  usageExamples = ['bite @user'];
  reactionType = 'bite';
  content = 'sank their teeth into';
  noTargetContent = 'looked around hungrily but ended up biting the air instead';

  slashOptions = [
    {
      name: 'target',
      description: 'The unsuspecting victim of your playful bite.',
      type: SlashCommandOptionTypes.User,
      required: false,
    },
  ];
}
