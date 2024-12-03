import { Injectable } from '@nestjs/common';
import { ReactBase } from './class/ReactBase.class';
import { SlashCommandOptionTypes } from '#command/command.types';

@Injectable()
export default class SneezeCommand extends ReactBase {
  name = 'sneeze';
  regex = new RegExp('^sneeze$|^sneeze ', 'i');
  description = 'Let out a sudden sneeze, maybe toward someone by accident!';
  category = 'reactions';
  usageExamples = ['sneeze @user'];
  reactionType = 'sneeze';
  content = 'sneezed loudly at';
  noTargetContent = 'sneezed loudly into the air, startling themselves in the process';

  slashOptions = [
    {
      name: 'target',
      description: 'The person who might have been caught in your sneeze.',
      type: SlashCommandOptionTypes.User,
      required: false,
    },
  ];
}
