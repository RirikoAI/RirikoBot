import { registerAs } from '@nestjs/config';
import { AuthConfig } from './config.type';
import { IsString } from 'class-validator';
import ConfigValidatorUtil from '#util/config/config-validator.util';
import ConfigFileUtil from '#util/config/config-file.util';

class EnvironmentVariablesValidator {
  @IsString()
  AUTH_JWT_SECRET: string;

  @IsString()
  AUTH_JWT_TOKEN_EXPIRES_IN: string;

  @IsString()
  AUTH_REFRESH_SECRET: string;

  @IsString()
  AUTH_REFRESH_TOKEN_EXPIRES_IN: string;
}

export default registerAs<AuthConfig>('auth', () => {
  // Load config from file
  const fileConfig = ConfigFileUtil.loadConfigFile('auth');

  ConfigValidatorUtil.validate(
    {
      ...fileConfig,
      ...process.env,
    },
    EnvironmentVariablesValidator,
  );

  return {
    secret: fileConfig['AUTH_JWT_SECRET'] || process.env.AUTH_JWT_SECRET,
    expires:
      fileConfig['AUTH_JWT_TOKEN_EXPIRES_IN'] ||
      process.env.AUTH_JWT_TOKEN_EXPIRES_IN,
    refreshSecret:
      fileConfig['AUTH_REFRESH_SECRET'] || process.env.AUTH_REFRESH_SECRET,
    refreshExpires:
      fileConfig['AUTH_REFRESH_TOKEN_EXPIRES_IN'] ||
      process.env.AUTH_REFRESH_TOKEN_EXPIRES_IN,
  };
});
