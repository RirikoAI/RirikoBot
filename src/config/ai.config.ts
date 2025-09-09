import { registerAs } from '@nestjs/config';
import { AIConfig } from './config.type';
import { IsOptional, IsString } from 'class-validator';
import ConfigValidatorUtil from '#util/config/config-validator.util';
import ConfigFileUtil from '#util/config/config-file.util';

class EnvironmentVariablesValidator {
  @IsString()
  @IsOptional()
  AI_SERVICE_TYPE: string;

  @IsString()
  @IsOptional()
  AI_SERVICE_API_KEY: string;

  @IsString()
  @IsOptional()
  AI_SERVICE_DEFAULT_MODEL: string;

  @IsString()
  @IsOptional()
  AI_SERVICE_BASE_URL: string;
}

export default registerAs<AIConfig>('ai', () => {
  // Load config from file
  const fileConfig = ConfigFileUtil.loadConfigFile('ai');

  ConfigValidatorUtil.validate(
    {
      ...fileConfig,
      ...process.env,
    },
    EnvironmentVariablesValidator,
  );

  // Merge config from file and environment variables
  return {
    serviceType:
      fileConfig['AI_SERVICE_TYPE'] || process.env.AI_SERVICE_TYPE || '',
    apiKey:
      fileConfig['AI_SERVICE_API_KEY'] || process.env.AI_SERVICE_API_KEY || '',
    defaultModel:
      fileConfig['AI_SERVICE_DEFAULT_MODEL'] ||
      process.env.AI_SERVICE_DEFAULT_MODEL ||
      '',
    baseUrl:
      fileConfig['AI_SERVICE_BASE_URL'] ||
      process.env.AI_SERVICE_BASE_URL ||
      '',
  };
});
