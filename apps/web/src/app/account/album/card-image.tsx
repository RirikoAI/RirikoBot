'use client';

import { useEffect, useRef, useState } from 'react';
import { LoadSlots } from './load-slots';

const FRAME = 'aspect-[2/3] w-full rounded';

/**
 * The image route draws a user's cards one at a time, so more card requests in flight only wait
 * on the server while holding the browser's six connections to the dashboard, and a click on
 * Older, Newer or Filter would queue behind them. Two keep the server busy and leave the rest
 * free for navigation.
 */
const slots = new LoadSlots(2);

/**
 * A card drawn by the album image route, loaded through `slots` in page order. When the route
 * cannot draw it, shows the same notice the album showed before images had their own route.
 */
export function AlbumCardImage({ src, alt }: { src: string; alt: string }) {
  const [status, setStatus] = useState<'queued' | 'shown' | 'failed'>('queued');
  const release = useRef<() => void>(() => undefined);

  useEffect(() => {
    // The slot is given back on load, on error, or here when the card leaves the page.
    release.current = slots.request(() => setStatus('shown'));
    return () => release.current();
  }, [src]);

  if (status === 'failed') {
    return (
      <div
        className={`${FRAME} flex items-center justify-center bg-panel p-4 text-center text-xs text-zinc-500`}
      >
        This card could not be drawn right now.
      </div>
    );
  }
  if (status === 'queued') return <div className={`${FRAME} bg-panel`} />;
  return (
    // The route needs the session cookie, which next/image's optimizer does not send.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      width={800}
      height={1200}
      decoding="async"
      onLoad={() => release.current()}
      onError={() => {
        release.current();
        setStatus('failed');
      }}
      className={`${FRAME} h-auto`}
    />
  );
}
