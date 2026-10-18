import { sql } from 'drizzle-orm';
import { text } from 'drizzle-orm/pg-core';

/**
 * A text primary key that defaults to a random uuid. These ids are text in PostgreSQL because
 * SQLite holds slugs (`card_fire_001`, `candy_minor`) and prefixed ids (`conv_<uuid>`) that card
 * images, payloads and references use as they are; both dialects keep the same value.
 */
export const textPrimaryKey = (name: string) =>
  text(name)
    .primaryKey()
    .default(sql`gen_random_uuid()::text`);
