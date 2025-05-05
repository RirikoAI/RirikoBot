import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import appConfig from '#config/app.config';
import databaseConfig from '#config/database.config';
import { DataSource, DataSourceOptions } from 'typeorm';
import { existsSync } from 'fs';
import { TypeOrmConfigService } from '../typeorm-config.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [databaseConfig, appConfig],
      envFilePath: ['.env'],
      ignoreEnvFile: !existsSync('.env'),
    }),
    TypeOrmModule.forRootAsync({
      useClass: TypeOrmConfigService,
      dataSourceFactory: async (options: DataSourceOptions) => {
        return new DataSource(options).initialize();
      },
    }),
  ],
})
export class SeedModule {}
