export * from './fixtures.js';
export * from './server.js';

import type { RecordedRequest } from './server.js';

/** Requests a fake running in another process has recorded (see `/__fake/requests`). */
export async function fetchRecordedRequests(fakeUrl: string): Promise<RecordedRequest[]> {
  const response = await fetch(`${fakeUrl}/__fake/requests`);
  if (!response.ok) throw new Error(`Fake Discord API answered ${response.status}`);
  return (await response.json()) as RecordedRequest[];
}

/** Routes a fake running in another process did not implement (see `/__fake/unhandled`). */
export async function fetchUnhandledRequests(fakeUrl: string): Promise<RecordedRequest[]> {
  const response = await fetch(`${fakeUrl}/__fake/unhandled`);
  if (!response.ok) throw new Error(`Fake Discord API answered ${response.status}`);
  return (await response.json()) as RecordedRequest[];
}
