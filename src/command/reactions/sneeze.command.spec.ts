import { Test, TestingModule } from '@nestjs/testing';
import SneezeCommand from './sneeze.command';
import { SlashCommandOptionTypes } from '#command/command.types';

describe('SneezeCommand', () => {
  let command: SneezeCommand;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [SneezeCommand],
    }).compile();

    command = module.get<SneezeCommand>(SneezeCommand);
  });

  it('should be defined', () => {
    expect(command).toBeDefined();
  });

  it('should have the correct properties', () => {
    expect(command.name).toBe('sneeze');
    expect(command.regex).toEqual(new RegExp('^sneeze$|^sneeze ', 'i'));
    expect(command.description).toBe(
      'Let out a sudden sneeze, maybe toward someone by accident!',
    );
    expect(command.category).toBe('reactions');
    expect(command.usageExamples).toEqual(['sneeze @user']);
    expect(command.reactionType).toBe('sneeze');
    expect(command.content).toBe('sneezed loudly at');
    expect(command.noTargetContent).toBe(
      'sneezed loudly into the air, startling themselves in the process',
    );
  });

  it('should define correct slash command options', () => {
    expect(command.slashOptions).toEqual([
      {
        name: 'target',
        description: 'The person who might have been caught in your sneeze.',
        type: SlashCommandOptionTypes.User,
        required: false,
      },
    ]);
  });

  describe('regex behavior', () => {
    it('should match valid sneeze commands', () => {
      expect(command.regex.test('sneeze')).toBe(true);
      expect(command.regex.test('sneeze @user')).toBe(true);
    });

    it('should not match invalid commands', () => {
      expect(command.regex.test('sneezes')).toBe(false);
      expect(command.regex.test('sneezing')).toBe(false);
      expect(command.regex.test('snee')).toBe(false);
    });
  });
});
