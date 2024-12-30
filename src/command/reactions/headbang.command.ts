import { Injectable } from '@nestjs/common';
import { ReactBase } from './class/ReactBase.class';
import { SlashCommandOptionTypes } from '#command/command.types';

@Injectable()
export default class HeadbangCommand extends ReactBase {
  name = 'headbang';
  regex = new RegExp('^headbang$|^headbang ', 'i');
  description = 'Turn up the volume and rock out with a headbang frenzy!';
  category = 'reactions';
  usageExamples = ['headbang @user'];
  reactionType = 'headbang';
  content = 'banged their head against the wall because of';
  noTargetContent =
    'banged their head against the wall repeatedly, consumed by frustration';

  slashOptions = [
    {
      name: 'target',
      description:
        'The person who drove you to bang your head against the wall.',
      type: SlashCommandOptionTypes.User,
      required: false,
    },
  ];
}
