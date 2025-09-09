import { registerAs } from '@nestjs/config';
import { AppConfig } from './config.type';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  Min,
} from 'class-validator';
import ConfigValidatorUtil from '#util/config/config-validator.util';
import ConfigFileUtil from '#util/config/config-file.util';

enum Environment {
  Development = 'development',
  Production = 'production',
  Test = 'test',
}

class EnvironmentVariablesValidator {
  @IsEnum(Environment)
  @IsOptional()
  NODE_ENV: Environment;

  @IsInt()
  @Min(0)
  @Max(65535)
  @IsOptional()
  APP_PORT: number;

  @IsUrl({ require_tld: false })
  @IsOptional()
  FRONTEND_URL: string;

  @IsUrl({ require_tld: false })
  @IsOptional()
  BACKEND_URL: string;

  @IsString()
  @IsOptional()
  APP_NAME: string;

  @IsString()
  @IsOptional()
  APP_FALLBACK_LANGUAGE: string;

  @IsString()
  @IsOptional()
  APP_HEADER_LANGUAGE: string;
}

export default registerAs<AppConfig>('app', () => {
  // Load config from file
  const fileConfig = ConfigFileUtil.loadConfigFile('app');

  ConfigValidatorUtil.validate(
    {
      ...fileConfig,
      ...process.env,
    },
    EnvironmentVariablesValidator,
  );

  return {
    name: fileConfig['APP_NAME'] || process.env.APP_NAME || 'Ririko',
    nodeEnv: fileConfig['NODE_ENV'] || process.env.NODE_ENV || 'development',
    port:
      fileConfig['APP_PORT'] ||
      (process.env.APP_PORT
        ? parseInt(process.env.APP_PORT, 10)
        : process.env.PORT
          ? parseInt(process.env.PORT, 10)
          : 3000),
    backendURL:
      fileConfig['BACKEND_URL'] ||
      process.env.BACKEND_URL ||
      'http://localhost:3000',
    frontendURL:
      fileConfig['FRONTEND_URL'] ||
      process.env.FRONTEND_URL ||
      'http://localhost:8100',
    fallbackLanguage:
      fileConfig['APP_FALLBACK_LANGUAGE'] ||
      process.env.APP_FALLBACK_LANGUAGE ||
      'en',
    headerLanguage:
      fileConfig['APP_HEADER_LANGUAGE'] ||
      process.env.APP_HEADER_LANGUAGE ||
      'x-custom-lang',
    workingDirectory: process.env.PWD || process.cwd(),
  };
});
