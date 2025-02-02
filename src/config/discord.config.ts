import { registerAs } from '@nestjs/config';
import { DiscordConfig } from './config.type';
import { IsOptional, IsString } from 'class-validator';
import ConfigValidatorUtil from '#util/config/config-validator.util';

class EnvironmentVariablesValidator {
  @IsString()
  DISCORD_BOT_TOKEN: string;

  @IsString()
  DISCORD_APPLICATION_ID: string;

  @IsString()
  @IsOptional()
  DISCORD_REDIRECT_URI: string;

  @IsString()
  @IsOptional()
  DISCORD_OAUTH2_CLIENT_SECRET: string;

  @IsString()
  DEFAULT_PREFIX: string;
}

export default registerAs<DiscordConfig>('discord', () => {
  ConfigValidatorUtil.validate(process.env, EnvironmentVariablesValidator);

  return {
    discordBotToken: process.env.DISCORD_BOT_TOKEN ?? '',
    discordApplicationId: process.env.DISCORD_APPLICATION_ID ?? '',
    defaultPrefix: process.env.DEFAULT_PREFIX ?? '!',
    discordRedirectUri: process.env.DISCORD_REDIRECT_URI ?? '',
    discordOauth2ClientSecret: process.env.DISCORD_OAUTH2_CLIENT_SECRET ?? '',
  };
});
