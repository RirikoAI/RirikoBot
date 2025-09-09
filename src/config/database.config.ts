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
import ConfigFileUtil from '#util/config/config-file.util';

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
  // Load config from file
  const fileConfig = ConfigFileUtil.loadConfigFile('database');

  ConfigValidatorUtil.validate(
    {
      ...fileConfig,
      ...process.env,
    },
    EnvironmentVariablesValidator,
  );

  return {
    logging:
      fileConfig['DATABASE_LOGGING'] !== undefined
        ? fileConfig['DATABASE_LOGGING']
        : process.env.DATABASE_LOGGING === 'true',
    url: fileConfig['DATABASE_URL'] || process.env.DATABASE_URL,
    type: fileConfig['DATABASE_TYPE'] || process.env.DATABASE_TYPE,
    host: fileConfig['DATABASE_HOST'] || process.env.DATABASE_HOST,
    port:
      fileConfig['DATABASE_PORT'] ||
      (process.env.DATABASE_PORT
        ? parseInt(process.env.DATABASE_PORT, 10)
        : 5432),
    password: fileConfig['DATABASE_PASSWORD'] || process.env.DATABASE_PASSWORD,
    name: fileConfig['DATABASE_NAME'] || process.env.DATABASE_NAME,
    username: fileConfig['DATABASE_USERNAME'] || process.env.DATABASE_USERNAME,
    synchronize:
      fileConfig['DATABASE_SYNCHRONIZE'] !== undefined
        ? fileConfig['DATABASE_SYNCHRONIZE']
        : process.env.DATABASE_SYNCHRONIZE === 'true',
    maxConnections:
      fileConfig['DATABASE_MAX_CONNECTIONS'] ||
      (process.env.DATABASE_MAX_CONNECTIONS
        ? parseInt(process.env.DATABASE_MAX_CONNECTIONS, 10)
        : 100),
    sslEnabled:
      fileConfig['DATABASE_SSL_ENABLED'] !== undefined
        ? fileConfig['DATABASE_SSL_ENABLED']
        : process.env.DATABASE_SSL_ENABLED === 'true',
    rejectUnauthorized:
      fileConfig['DATABASE_REJECT_UNAUTHORIZED'] !== undefined
        ? fileConfig['DATABASE_REJECT_UNAUTHORIZED']
        : process.env.DATABASE_REJECT_UNAUTHORIZED === 'true',
    ca: fileConfig['DATABASE_CA'] || process.env.DATABASE_CA,
    key: fileConfig['DATABASE_KEY'] || process.env.DATABASE_KEY,
    cert: fileConfig['DATABASE_CERT'] || process.env.DATABASE_CERT,
  };
});
