import { registerAs } from '@nestjs/config';
import { DatabaseConfig } from './config.type';
import {
  IsOptional,
  IsInt,
  Min,
  Max,
  IsString,
  ValidateIf,
  IsBoolean,
} from 'class-validator';
import ConfigValidatorUtil from '#util/config/config-validator.util';

class EnvironmentVariablesValidator {
  @ValidateIf((envValues) => envValues.DATABASE_URL)
  @IsString()
  DATABASE_URL: string;

  @IsBoolean()
  @IsOptional()
  DATABASE_LOGGING: boolean;

  @IsString()
  DATABASE_TYPE: string;

  @ValidateIf(
    (envValues) =>
      !envValues.DATABASE_URL &&
      envValues.DATABASE_TYPE !== 'sqlite' &&
      envValues.DATABASE_TYPE !== 'better-sqlite3',
  )
  @IsString()
  DATABASE_HOST: string;

  @ValidateIf(
    (envValues) =>
      !envValues.DATABASE_URL &&
      envValues.DATABASE_TYPE !== 'sqlite' &&
      envValues.DATABASE_TYPE !== 'better-sqlite3',
  )
  @IsInt()
  @Min(0)
  @Max(65535)
  DATABASE_PORT: number;

  @ValidateIf(
    (envValues) =>
      !envValues.DATABASE_URL &&
      envValues.DATABASE_TYPE !== 'sqlite' &&
      envValues.DATABASE_TYPE !== 'better-sqlite3',
  )
  @IsString()
  DATABASE_PASSWORD: string;

  @ValidateIf((envValues) => !envValues.DATABASE_URL)
  @IsString()
  DATABASE_NAME: string;

  @ValidateIf(
    (envValues) =>
      !envValues.DATABASE_URL &&
      envValues.DATABASE_TYPE !== 'sqlite' &&
      envValues.DATABASE_TYPE !== 'better-sqlite3',
  )
  @IsString()
  DATABASE_USERNAME: string;

  @IsBoolean()
  @IsOptional()
  DATABASE_SYNCHRONIZE: boolean;

  @IsInt()
  @IsOptional()
  DATABASE_MAX_CONNECTIONS: number;

  @IsBoolean()
  @IsOptional()
  DATABASE_SSL_ENABLED: boolean;

  @IsBoolean()
  @IsOptional()
  DATABASE_REJECT_UNAUTHORIZED: boolean;

  @IsString()
  @IsOptional()
  DATABASE_CA: string;

  @IsString()
  @IsOptional()
  DATABASE_KEY: string;

  @IsString()
  @IsOptional()
  DATABASE_CERT: string;
}

export default registerAs<DatabaseConfig>('database', () => {
  ConfigValidatorUtil.validate(process.env, EnvironmentVariablesValidator);

  return {
    logging: process.env.DATABASE_LOGGING === 'true',
    url: process.env.DATABASE_URL,
    type: process.env.DATABASE_TYPE,
    host: process.env.DATABASE_HOST,
    port: process.env.DATABASE_PORT
      ? parseInt(process.env.DATABASE_PORT, 10)
      : 5432,
    password: process.env.DATABASE_PASSWORD,
    name: process.env.DATABASE_NAME,
    username: process.env.DATABASE_USERNAME,
    synchronize: process.env.DATABASE_SYNCHRONIZE === 'true',
    maxConnections: process.env.DATABASE_MAX_CONNECTIONS
      ? parseInt(process.env.DATABASE_MAX_CONNECTIONS, 10)
      : 100,
    sslEnabled: process.env.DATABASE_SSL_ENABLED === 'true',
    rejectUnauthorized: process.env.DATABASE_REJECT_UNAUTHORIZED === 'true',
    ca: process.env.DATABASE_CA,
    key: process.env.DATABASE_KEY,
    cert: process.env.DATABASE_CERT,
  };
});
