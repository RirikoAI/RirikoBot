import { REST, type RESTOptions } from 'discord.js';

export type RestClientOptions = Partial<RESTOptions>;

/**
 * Creates and configures a Discord REST API v10 client.
 */
export function createRestClient(token: string, options: RestClientOptions = {}): REST {
  const restOptions: Partial<RESTOptions> = {
    version: '10',
    ...options,
  };

  const rest = new REST(restOptions);
  return rest.setToken(token);
}
