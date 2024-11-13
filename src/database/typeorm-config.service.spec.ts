import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { TypeOrmConfigService } from './typeorm-config.service';
import { TypeOrmModuleOptions } from '@nestjs/typeorm';

describe('TypeOrmConfigService', () => {
  let service: TypeOrmConfigService;
  let configService: ConfigService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TypeOrmConfigService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              const config = {
                'database.type': 'sqlite',
                'database.url': undefined,
                'database.host': undefined,
                'database.port': undefined,
                'database.username': undefined,
                'database.password': undefined,
                'database.name': ':memory:',
                'database.synchronize': true,
                'database.logging': true,
                'database.maxConnections': 10,
                'database.sslEnabled': false,
                'database.rejectUnauthorized': undefined,
                'database.ca': undefined,
                'database.key': undefined,
                'database.cert': undefined,
              };
              return config[key];
            }),
          },
        },
      ],
    }).compile();

    service = module.get<TypeOrmConfigService>(TypeOrmConfigService);
    configService = module.get<ConfigService>(ConfigService);
    console.log(configService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should create TypeORM options', () => {
    const options: TypeOrmModuleOptions = service.createTypeOrmOptions();

    expect(options.type).toBe('sqlite');
    expect(options.database).toBe(':memory:');
    expect(options.synchronize).toBe(true);
    expect(options.logging).toBe(true);
    expect(options.extra.max).toBe(10);
    expect(options.extra.ssl).toBeUndefined();
  });
});
