export interface LavalinkNodeOptions {
  host?: string | undefined;
  port?: number | undefined;
  password?: string | undefined;
  secure?: boolean | undefined;
}

export interface LavalinkClientOptions {
  enabled?: boolean | undefined;
  node?: LavalinkNodeOptions | undefined;
  clientId?: string | undefined;
  clientUsername?: string | undefined;
  sendToShard?: ((guildId: string, payload: unknown) => void) | undefined;
}
