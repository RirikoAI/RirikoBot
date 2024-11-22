// src/database/database.module.ts
import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TypeOrmConfigService } from '#database/typeorm-config.service';
import { DataSource, DataSourceOptions } from 'typeorm';
import { DatabaseService } from '#database/database.service';

const entitiesRequire = require('require-all')({
  dirname: __dirname + '/entities',
  recursive: true,
});

export const entities = Object.values(entitiesRequire).map((entity) => {
  const entityClass = Object.values(entity)[0];
  return entityClass;
});

@Global()
@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      useClass: TypeOrmConfigService,
      dataSourceFactory: async (options: DataSourceOptions) =>
        new DataSource(options).initialize(),
    }),
    TypeOrmModule.forFeature(entities),
  ],
  providers: [DatabaseService],
  exports: [TypeOrmModule],
})
export class DatabaseModule {}
