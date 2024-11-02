export type DatabaseConfig = {
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
  nodeEnv: string;
  port: number;
};

export type DiscordConfig = {
  discordBotToken: string;
  discordApplicationId: string;
  adminPrefix: string;
  defaultPrefix: string;
}

export type AllConfigType = {
  app: AppConfig;
  database: DatabaseConfig;
  discord: DiscordConfig;
};