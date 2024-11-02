import { registerAs } from '@nestjs/config';
import { DiscordConfig } from './config.type';
import { IsString } from 'class-validator';
import configValidatorUtil from '#util/config/config-validator.util';

class EnvironmentVariablesValidator {
  @IsString()
  DISCORD_BOT_TOKEN: string;

  @IsString()
  DISCORD_APPLICATION_ID: string;

  ADMIN_PREFIX: string;

  DEFAULT_PREFIX: string;
}

export default registerAs<DiscordConfig>('discord', () => {
  configValidatorUtil(process.env, EnvironmentVariablesValidator);

  return {
    discordBotToken: process.env.DISCORD_BOT_TOKEN ?? '',
    discordApplicationId: process.env.DISCORD_APPLICATION_ID ?? '',
    adminPrefix: process.env.ADMIN_PREFIX ?? 'admin!',
    defaultPrefix: process.env.DEFAULT_PREFIX ?? '!',
  };
});