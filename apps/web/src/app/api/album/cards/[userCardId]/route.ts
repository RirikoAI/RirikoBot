import { createHash } from 'node:crypto';
import type { NextRequest } from 'next/server';
import { requireSession } from '@/lib/server/auth/session';
import { getWebServices } from '@/lib/server/services';

/**
 * One of the signed-in user's own cards as a PNG, for the album page. Any other card ID is a 404,
 * so the route does not reveal whether another user's card exists. Browsers must revalidate
 * before reusing the image (`no-cache` with an ETag): a card can change hands or have its art
 * taken down, and the next person signed in on the same browser must not see a cached copy.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ userCardId: string }> },
) {
  const session = await requireSession('/account/album');
  const { userCardId } = await params;
  const { cardAlbum } = await getWebServices();

  let png: Buffer | null;
  try {
    png = await cardAlbum.cardImage(session.userId, userCardId);
  } catch (error) {
    console.warn(`[album] Could not draw card ${userCardId}:`, error);
    return plainText('This card could not be drawn right now.', 500);
  }
  if (!png) return plainText('Not found', 404);

  const etag = `"${createHash('sha256').update(png).digest('base64url')}"`;
  const headers = { 'Cache-Control': 'private, no-cache', ETag: etag };
  if (matchesEtag(request.headers.get('if-none-match'), etag)) {
    return new Response(null, { status: 304, headers });
  }
  return new Response(new Uint8Array(png), {
    headers: { ...headers, 'Content-Type': 'image/png' },
  });
}

function plainText(body: string, status: number): Response {
  return new Response(body, {
    status,
    headers: { 'Cache-Control': 'no-store', 'Content-Type': 'text/plain; charset=utf-8' },
  });
}

/** Whether an If-None-Match header lists `etag` (weak or strong) or is `*`. */
function matchesEtag(header: string | null, etag: string): boolean {
  if (!header) return false;
  return header.split(',').some((tag) => {
    const value = tag.trim();
    return value === '*' || value.replace(/^W\//, '') === etag;
  });
}
