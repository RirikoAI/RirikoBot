import { registerAs } from '@nestjs/config';
import { MailConfig } from './config.type';
import {
  IsString,
  IsInt,
  Min,
  Max,
  IsOptional,
  IsBoolean,
  IsEmail,
} from 'class-validator';
import ConfigValidatorUtil from '#util/config/config-validator.util';
import ConfigFileUtil from '#util/config/config-file.util';

class EnvironmentVariablesValidator {
  @IsInt()
  @Min(0)
  @Max(65535)
  @IsOptional()
  MAIL_PORT: number;

  @IsString()
  MAIL_HOST: string;

  @IsString()
  @IsOptional()
  MAIL_USER: string;

  @IsString()
  @IsOptional()
  MAIL_PASSWORD: string;

  @IsEmail()
  MAIL_DEFAULT_EMAIL: string;

  @IsString()
  MAIL_DEFAULT_NAME: string;

  @IsBoolean()
  MAIL_IGNORE_TLS: boolean;

  @IsBoolean()
  MAIL_SECURE: boolean;

  @IsBoolean()
  MAIL_REQUIRE_TLS: boolean;
}

export default registerAs<MailConfig>('mail', () => {
  ConfigValidatorUtil.validate(process.env, EnvironmentVariablesValidator);

  // Load config from file
  const fileConfig = ConfigFileUtil.loadConfigFile('mail');

  return {
    port: fileConfig['port'] || (process.env.MAIL_PORT ? parseInt(process.env.MAIL_PORT, 10) : 587),
    host: fileConfig['host'] || process.env.MAIL_HOST,
    user: fileConfig['user'] || process.env.MAIL_USER,
    password: fileConfig['password'] || process.env.MAIL_PASSWORD,
    defaultEmail: fileConfig['defaultEmail'] || process.env.MAIL_DEFAULT_EMAIL,
    defaultName: fileConfig['defaultName'] || process.env.MAIL_DEFAULT_NAME,
    ignoreTLS: fileConfig['ignoreTLS'] !== undefined ? fileConfig['ignoreTLS'] : process.env.MAIL_IGNORE_TLS === 'true',
    secure: fileConfig['secure'] !== undefined ? fileConfig['secure'] : process.env.MAIL_SECURE === 'true',
    requireTLS: fileConfig['requireTLS'] !== undefined ? fileConfig['requireTLS'] : process.env.MAIL_REQUIRE_TLS === 'true',
  };
});
