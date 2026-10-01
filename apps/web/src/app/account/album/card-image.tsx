'use client';

import { useEffect, useRef, useState } from 'react';

const FRAME = 'aspect-[2/3] w-full rounded';

/**
 * A card drawn by the album image route. When the route cannot draw it, shows the same notice
 * the album showed before images had their own route.
 */
export function AlbumCardImage({ src, alt }: { src: string; alt: string }) {
  const image = useRef<HTMLImageElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    // An image that failed before hydration fired its error event before React listened for it.
    const img = image.current;
    if (img?.complete && img.naturalWidth === 0) setFailed(true);
  }, []);

  if (failed) {
    return (
      <div
        className={`${FRAME} flex items-center justify-center bg-panel p-4 text-center text-xs text-zinc-500`}
      >
        This card could not be drawn right now.
      </div>
    );
  }
  return (
    // The route needs the session cookie, which next/image's optimizer does not send.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      ref={image}
      src={src}
      alt={alt}
      width={800}
      height={1200}
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
      className={`${FRAME} h-auto`}
    />
  );
}
