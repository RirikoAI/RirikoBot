import { Test } from '@nestjs/testing';
import { FreeGamesModule } from './free-games.module';
import { FreeGamesService } from './free-games.service';
import { FreeGamesScheduler } from './free-games.scheduler';
import { DatabaseModule } from '#database/database.module';

jest.mock('#discord/discord.module');
jest.mock('#database/database.module');
jest.mock('#command/command.module');
jest.mock('./free-games.service');
jest.mock('./free-games.scheduler');

describe('FreeGamesModule', () => {
  let module: FreeGamesModule;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [FreeGamesModule],
    }).compile();

    module = moduleRef.get<FreeGamesModule>(FreeGamesModule);
  });

  it('should be defined', () => {
    expect(module).toBeDefined();
  });

  it('should have correct imports', () => {
    const moduleDefinition = Reflect.getMetadata('imports', FreeGamesModule);
    expect(moduleDefinition).toHaveLength(3);
    expect(moduleDefinition).toContainEqual(expect.any(Function)); // forwardRef DiscordModule
    expect(moduleDefinition).toContain(DatabaseModule);
    expect(moduleDefinition).toContainEqual(expect.any(Function)); // forwardRef CommandModule
  });

  it('should have correct providers', () => {
    const providers = Reflect.getMetadata('providers', FreeGamesModule);
    expect(providers).toHaveLength(2);
    expect(providers).toContain(FreeGamesService);
    expect(providers).toContain(FreeGamesScheduler);
  });

  it('should have correct exports', () => {
    const exports = Reflect.getMetadata('exports', FreeGamesModule);
    expect(exports).toHaveLength(1);
    expect(exports).toContain(FreeGamesService);
  });
});
