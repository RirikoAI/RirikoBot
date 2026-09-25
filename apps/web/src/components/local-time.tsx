'use client';

import { useSyncExternalStore } from 'react';

const localFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });
const utcFormat = new Intl.DateTimeFormat('en-GB', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'UTC',
});

const subscribe = () => () => undefined;

/**
 * A timestamp in the viewer's locale and time zone. The server does not know either, so it
 * renders UTC and the browser switches to local time right after hydration, without a
 * hydration mismatch.
 */
export function LocalTime({ value }: { value: string }) {
  const text = useSyncExternalStore(
    subscribe,
    () => localFormat.format(new Date(value)),
    () => `${utcFormat.format(new Date(value))} UTC`,
  );
  return <time dateTime={value}>{text}</time>;
}
