import type {
  DatabaseClient,
  PostgresDatabaseClient,
  SqliteDatabaseClient,
} from '../client/types.js';
import type { IRepository } from './types.js';

/**
 * Base abstract repository encapsulating dual-dialect dispatching and transactional context.
 */
export abstract class BaseRepository<
  TEntity,
  TCreateInput,
  TUpdateInput,
  TId = string,
> implements IRepository<TEntity, TCreateInput, TUpdateInput, TId> {
  constructor(protected readonly client: DatabaseClient) {}

  /**
   * Resolves the active database client, preferring a provided transaction client.
   */
  protected getClient(tx?: DatabaseClient): DatabaseClient {
    return tx ?? this.client;
  }

  /**
   * Type guard checking if the client uses SQLite dialect.
   */
  protected isSqlite(client: DatabaseClient): client is SqliteDatabaseClient {
    return client.dialect === 'sqlite';
  }

  /**
   * Type guard checking if the client uses PostgreSQL dialect.
   */
  protected isPostgres(client: DatabaseClient): client is PostgresDatabaseClient {
    return client.dialect === 'postgres';
  }

  abstract findById(id: TId, tx?: DatabaseClient): Promise<TEntity | null>;
  abstract create(data: TCreateInput, tx?: DatabaseClient): Promise<TEntity>;
  abstract update(id: TId, data: TUpdateInput, tx?: DatabaseClient): Promise<TEntity>;
  abstract exists(id: TId, tx?: DatabaseClient): Promise<boolean>;
  abstract delete(id: TId, tx?: DatabaseClient): Promise<boolean>;
  abstract count(tx?: DatabaseClient): Promise<number>;
}
