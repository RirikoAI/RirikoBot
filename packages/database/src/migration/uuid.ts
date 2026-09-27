import { createHash } from 'node:crypto';

/** Namespace for IDs derived from 1.4.0 rows (a fixed random UUID; never change it). */
const LEGACY_NAMESPACE = '3f0b6c2e-8d4a-4f7e-9b1c-5a2d7e6f8c90';

/** A name-based UUID (RFC 9562 version 5): the same namespace and name always give the same UUID. */
export function uuidV5(namespace: string, name: string): string {
  const namespaceBytes = Buffer.from(namespace.replace(/-/g, ''), 'hex');
  const hash = createHash('sha1').update(namespaceBytes).update(name, 'utf8').digest();
  hash[6] = (hash[6]! & 0x0f) | 0x50;
  hash[8] = (hash[8]! & 0x3f) | 0x80;
  const hex = hash.subarray(0, 16).toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * The 2.0 ID for a legacy row. Re-running the migration derives the same IDs, so rows are not
 * duplicated and keep pointing at each other, and the value fits the uuid columns on Postgres.
 */
export function legacyUuid(name: string): string {
  return uuidV5(LEGACY_NAMESPACE, name);
}
