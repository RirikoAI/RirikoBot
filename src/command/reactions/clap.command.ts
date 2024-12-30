import { Injectable } from '@nestjs/common';
import { ReactBase } from './class/ReactBase.class';
import { SlashCommandOptionTypes } from '#command/command.types';

@Injectable()
export default class ClapCommand extends ReactBase {
  name = 'clap';
  regex = new RegExp('^clap$|^clap ', 'i');
  description = 'Applaud someone with enthusiasm and appreciation!';
  category = 'reactions';
  usageExamples = ['clap @user'];
  reactionType = 'clap';
  content = 'gave a round of applause to';
  noTargetContent = 'clapped enthusiastically, celebrating the moment';

  slashOptions = [
    {
      name: 'target',
      description: 'The person you want to cheer for with a big clap.',
      type: SlashCommandOptionTypes.User,
      required: false,
    },
  ];
}
