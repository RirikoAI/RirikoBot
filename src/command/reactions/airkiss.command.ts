import { Injectable } from '@nestjs/common';
import { ReactBase } from './class/ReactBase.class';
import { SlashCommandOptionTypes } from '#command/command.types';

@Injectable()
export default class AirKissCommand extends ReactBase {
  name = 'airkiss';
  regex = new RegExp('^airkiss$|^airkiss ', 'i');
  description = 'Blow an air kiss to someone who deserves your affection.';
  category = 'reactions';
  usageExamples = ['airkiss @user'];
  reactionType = 'airkiss';
  content = 'blew an air kiss at';
  noTargetContent = 'blew an air kiss into the air, charming no one';

  slashOptions = [
    {
      name: 'target',
      description: 'That lucky someone you want to charm with an air kiss.',
      type: SlashCommandOptionTypes.User,
      required: false,
    },
  ];
}
