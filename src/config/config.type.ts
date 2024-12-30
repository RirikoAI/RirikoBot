export type DatabaseConfig = {
  logging?: boolean;
  url?: string;
  path?: string;
  type?: string;
  host?: string;
  port?: number;
  password?: string;
  name?: string;
  username?: string;
  synchronize?: boolean;
  maxConnections: number;
  sslEnabled?: boolean;
  rejectUnauthorized?: boolean;
  ca?: string;
  key?: string;
  cert?: string;
};

export type AppConfig = {
  name: string;
  nodeEnv: string;
  port: number;
  frontendDomain?: string;
  backendDomain?: string;
  workingDirectory: string;
  fallbackLanguage: string;
  headerLanguage: string;
};

export type DiscordConfig = {
  discordBotToken: string;
  discordApplicationId: string;
  defaultPrefix: string;
};

export type AuthConfig = {
  secret: string;
  expires?: string;
  refreshSecret?: string;
  refreshExpires?: string;
};

export type MailConfig = {
  port: number;
  host?: string;
  user?: string;
  password?: string;
  defaultEmail?: string;
  defaultName?: string;
  ignoreTLS: boolean;
  secure: boolean;
  requireTLS: boolean;
};

export type AllConfigType = {
  auth: AuthConfig;
  app: AppConfig;
  database: DatabaseConfig;
  discord: DiscordConfig;
  mail: MailConfig;
};
