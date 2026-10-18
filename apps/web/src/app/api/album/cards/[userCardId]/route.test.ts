import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const OWNER = '200000000000000001';
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]);

const mocks = vi.hoisted(() => ({
  requireSession: vi.fn(),
  cardImage: vi.fn(),
}));

vi.mock('@/lib/server/auth/session', () => ({ requireSession: mocks.requireSession }));
vi.mock('@/lib/server/services', () => ({
  getWebServices: async () => ({ cardAlbum: { cardImage: mocks.cardImage } }),
}));

const { GET } = await import('./route');

function get(userCardId: string, headers: Record<string, string> = {}): Promise<Response> {
  const request = new NextRequest(`https://dash.example.com/api/album/cards/${userCardId}`, {
    headers,
  });
  return GET(request, { params: Promise.resolve({ userCardId }) });
}

describe('album card image route (BUG-0028)', () => {
  beforeEach(() => {
    mocks.requireSession.mockReset().mockResolvedValue({ userId: OWNER });
    mocks.cardImage.mockReset();
  });

  it("serves the signed-in user's card as a PNG that browsers must revalidate", async () => {
    mocks.cardImage.mockResolvedValue(PNG);

    const response = await get('uc-1');

    expect(mocks.requireSession).toHaveBeenCalledWith('/account/album');
    expect(mocks.cardImage).toHaveBeenCalledWith(OWNER, 'uc-1');
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('image/png');
    expect(response.headers.get('cache-control')).toBe('private, no-cache');
    expect(response.headers.get('etag')).toMatch(/^"[\w-]{43}"$/);
    expect(Buffer.from(await response.arrayBuffer())).toEqual(PNG);
  });

  it('answers 304 when the browser already has this image', async () => {
    mocks.cardImage.mockResolvedValue(PNG);
    const etag = (await get('uc-1')).headers.get('etag')!;

    const unchanged = await get('uc-1', { 'if-none-match': `"other", W/${etag}` });
    expect(unchanged.status).toBe(304);
    expect(unchanged.headers.get('etag')).toBe(etag);
    expect(await unchanged.text()).toBe('');

    mocks.cardImage.mockResolvedValue(Buffer.from('a redrawn card'));
    const changed = await get('uc-1', { 'if-none-match': etag });
    expect(changed.status).toBe(200);
    expect(changed.headers.get('etag')).not.toBe(etag);
  });

  it("answers 404 for a card that is not the user's", async () => {
    mocks.cardImage.mockResolvedValue(null);

    const response = await get('someone-elses-card');

    expect(response.status).toBe(404);
    expect(response.headers.get('content-type')).toContain('text/plain');
  });

  it('answers 500 and logs when the card cannot be drawn', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    mocks.cardImage.mockRejectedValue(new Error('canvas unavailable'));

    const response = await get('uc-1');

    expect(response.status).toBe(500);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(warn).toHaveBeenCalledWith('[album] Could not draw card uc-1:', expect.any(Error));
    warn.mockRestore();
  });

  it('never looks up a card before the session check passes', async () => {
    const redirect = new Error('NEXT_REDIRECT');
    mocks.requireSession.mockRejectedValue(redirect);

    await expect(get('uc-1')).rejects.toBe(redirect);
    expect(mocks.cardImage).not.toHaveBeenCalled();
  });
});
