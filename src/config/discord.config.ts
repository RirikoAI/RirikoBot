import { registerAs } from '@nestjs/config';
import { DiscordConfig } from './config.type';
import { IsOptional, IsString } from 'class-validator';
import ConfigValidatorUtil from '#util/config/config-validator.util';
import ConfigFileUtil from '#util/config/config-file.util';

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
  // Validate environment variables
  ConfigValidatorUtil.validate(process.env, EnvironmentVariablesValidator);

  // Load config from file
  const fileConfig = ConfigFileUtil.loadConfigFile('discord');

  // Merge config from file and environment variables
  const config = {
    discordBotToken: fileConfig['discordBotToken'] || process.env.DISCORD_BOT_TOKEN || '',
    discordApplicationId: fileConfig['discordApplicationId'] || process.env.DISCORD_APPLICATION_ID || '',
    defaultPrefix: fileConfig['defaultPrefix'] || process.env.DEFAULT_PREFIX || '!',
    discordRedirectUri: fileConfig['discordRedirectUri'] || process.env.DISCORD_REDIRECT_URI || '',
    discordOauth2ClientSecret: fileConfig['discordOauth2ClientSecret'] || process.env.DISCORD_OAUTH2_CLIENT_SECRET || '',
  };

  // Validate required Discord tokens
  if (!config.discordBotToken || !config.discordApplicationId) {
    throw new Error('DISCORD_BOT_TOKEN and DISCORD_APPLICATION_ID must be set in either config/discord.config.ts or .env file');
  }

  return config;
});
