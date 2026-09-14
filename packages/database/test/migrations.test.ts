import { describe, expect, it } from 'vitest';
import { inspectObjects, managedTables, migrationChecksum, verifyHistory } from '../src/migrations.js';
import { validateSave } from '../src/validation.js';

describe('migration guards', () => {
  it('distinguishes empty, complete and foreign schemas', () => {
    expect(inspectObjects([])).toBe(false);
    expect(inspectObjects(managedTables)).toBe(true);
    expect(() => inspectObjects(['user', 'guild'])).toThrow(/legacy or unrecognized/);
    expect(() => inspectObjects(['guild_settings'])).toThrow(/incomplete/);
  });

  it('rejects changed and future migration history', () => {
    expect(verifyHistory([{ version: 1, checksum: migrationChecksum('sqlite') }], 'sqlite')).toEqual({ current: 1, latest: 1 });
    expect(() => verifyHistory([{ version: 1, checksum: migrationChecksum('postgres') }], 'sqlite')).toThrow(/does not match/);
    expect(() => verifyHistory([{ version: 2, checksum: migrationChecksum('sqlite') }], 'sqlite')).toThrow(/does not match/);
    expect(() => verifyHistory([], 'sqlite')).toThrow(/does not match/);
  });

  it('prevents unsafe revision increments before any write', () => {
    const settings = { guildId: '1', prefix: '!', modules: {}, commands: {}, revision: Number.MAX_SAFE_INTEGER - 1 };
    expect(() => validateSave(settings, settings.revision, '2')).toThrow(/revision limit/);
  });
});
