import { Test, TestingModule } from '@nestjs/testing';
import { CommandService } from './command.service';
import {ConfigModule} from "../config/config.module";

describe('ConfigService', () => {
    let service: CommandService;

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            imports: [ConfigModule],
            providers: [CommandService],
            exports: [CommandService],
        }).compile();

        service = module.get<CommandService>(CommandService);
    });

    it('should be defined', () => {
        expect(service).toBeDefined();
    });
});
