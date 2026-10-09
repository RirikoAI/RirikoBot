import { describe, expect, it } from 'vitest';
import { createDatabaseClient } from '../client/factory.js';
import { SQLITE_SCHEMA_DDL } from '../schema/sqlite/ddl.js';
import { ensureGuildRegistrySchema } from './guild-registry.js';

type Column = { name: string; type: string };

describe('ensureGuildRegistrySchema', () => {
  async function legacyDatabase() {
    const client = await createDatabaseClient({ dialect: 'sqlite', url: ':memory:' });
    if (client.dialect !== 'sqlite') throw new Error('expected SQLite');
    client.raw.exec(SQLITE_SCHEMA_DDL);
    // The table as it was before the bot recorded its servers.
    client.raw.exec('ALTER TABLE guilds DROP COLUMN invited_by_id');
    client.raw.exec('ALTER TABLE guilds DROP COLUMN invited_via');
    return client;
  }

  const columns = (client: Awaited<ReturnType<typeof legacyDatabase>>): Column[] =>
    client.raw.prepare('PRAGMA table_info(guilds)').all() as Column[];

  it('adds the inviter column to an existing SQLite database and keeps its rows', async () => {
    const client = await legacyDatabase();
    client.raw.exec(
      `INSERT INTO guilds (id, name, owner_id, joined_at, is_active, created_at, updated_at)
       VALUES ('g1', 'Server', 'o1', 1, 1, 1, 1)`,
    );
    expect(columns(client).some((column) => column.name === 'invited_by_id')).toBe(false);

    expect(await ensureGuildRegistrySchema(client)).toBe(true);

    for (const name of ['invited_by_id', 'invited_via']) {
      expect(columns(client).find((column) => column.name === name)).toMatchObject({
        type: 'TEXT',
      });
    }
    expect(client.raw.prepare('SELECT id, invited_by_id, invited_via FROM guilds').all()).toEqual([
      { id: 'g1', invited_by_id: null, invited_via: null },
    ]);
    await client.close();
  });

  it('adds only the source column to a database that already has the inviter column', async () => {
    const client = await legacyDatabase();
    client.raw.exec('ALTER TABLE guilds ADD COLUMN invited_by_id text');
    client.raw.exec(
      `INSERT INTO guilds (id, name, owner_id, invited_by_id, joined_at, is_active, created_at, updated_at)
       VALUES ('g1', 'Server', 'o1', 'u1', 1, 1, 1, 1)`,
    );

    expect(await ensureGuildRegistrySchema(client)).toBe(true);

    expect(client.raw.prepare('SELECT id, invited_by_id, invited_via FROM guilds').all()).toEqual([
      { id: 'g1', invited_by_id: 'u1', invited_via: null },
    ]);
    expect(await ensureGuildRegistrySchema(client)).toBe(false);
    await client.close();
  });

  it('changes nothing the second time', async () => {
    const client = await legacyDatabase();
    await ensureGuildRegistrySchema(client);
    const before = columns(client);

    expect(await ensureGuildRegistrySchema(client)).toBe(false);

    expect(columns(client)).toEqual(before);
    await client.close();
  });

  it('leaves a database created from the current DDL alone', async () => {
    const client = await createDatabaseClient({ dialect: 'sqlite', url: ':memory:' });
    if (client.dialect !== 'sqlite') throw new Error('expected SQLite');
    client.raw.exec(SQLITE_SCHEMA_DDL);

    expect(await ensureGuildRegistrySchema(client)).toBe(false);
    await client.close();
  });
});
