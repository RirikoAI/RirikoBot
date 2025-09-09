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
  ConfigValidatorUtil.validate(process.env, EnvironmentVariablesValidator);

  // Load config from file
  const fileConfig = ConfigFileUtil.loadConfigFile('auth');

  return {
    secret: fileConfig['secret'] || process.env.AUTH_JWT_SECRET,
    expires: fileConfig['expires'] || process.env.AUTH_JWT_TOKEN_EXPIRES_IN,
    refreshSecret: fileConfig['refreshSecret'] || process.env.AUTH_REFRESH_SECRET,
    refreshExpires: fileConfig['refreshExpires'] || process.env.AUTH_REFRESH_TOKEN_EXPIRES_IN,
  };
});
