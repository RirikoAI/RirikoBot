import type { DatabaseClient } from '../client/types.js';

export interface PaginationOptions {
  limit?: number | undefined;
  offset?: number | undefined;
}

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}

export interface IRepository<TEntity, TCreateInput, TUpdateInput, TId = string> {
  findById(id: TId, tx?: DatabaseClient): Promise<TEntity | null>;
  create(data: TCreateInput, tx?: DatabaseClient): Promise<TEntity>;
  update(id: TId, data: TUpdateInput, tx?: DatabaseClient): Promise<TEntity>;
  exists(id: TId, tx?: DatabaseClient): Promise<boolean>;
  delete(id: TId, tx?: DatabaseClient): Promise<boolean>;
  count(tx?: DatabaseClient): Promise<number>;
}
