import { NextResponse, type NextRequest } from 'next/server';
import { BOUND_COOKIE, BOUND_COOKIE_TTL_MS, challengeHeader } from '@/lib/server/auth/dbsc';
import { setCookie } from '@/lib/server/auth/session';
import { limitAuthRequest } from '@/lib/server/rate-limit';
import { getWebServices } from '@/lib/server/services';

const NO_STORE = { 'Cache-Control': 'no-store' };
/** `Sec-Secure-Session-Id` is an RFC 8941 string: the identifier in double quotes. */
const SESSION_ID_HEADER = /^"([A-Za-z0-9_-]{1,128})"$/;

/**
 * DBSC refresh (STORY-119). The browser calls this itself when the bound cookie is missing or
 * expired. Without a valid proof it answers 403 with a challenge to sign; a proof from the stored
 * key earns a new bound cookie; a session that ended gets 404, so the browser drops its binding.
 * The proof is the authentication, so there is no same-origin check.
 */
export async function POST(request: NextRequest) {
  const limited = limitAuthRequest(request);
  if (limited) return limited;
  const sid = SESSION_ID_HEADER.exec(request.headers.get('sec-secure-session-id') ?? '')?.[1];
  if (!sid) return new NextResponse('Missing session id', { status: 400, headers: NO_STORE });

  const { sessions } = await getWebServices();
  const result = await sessions.refreshBinding(sid, request.headers.get('secure-session-response'));
  if (result.kind === 'unknown') {
    return new NextResponse('Unknown session', { status: 404, headers: NO_STORE });
  }
  if (result.kind === 'challenge') {
    return new NextResponse('Challenge required', {
      status: 403,
      headers: { ...NO_STORE, 'Secure-Session-Challenge': challengeHeader(result.challenge, sid) },
    });
  }
  const response = new NextResponse(null, { status: 200, headers: NO_STORE });
  setCookie(response, BOUND_COOKIE, result.boundCookie, BOUND_COOKIE_TTL_MS / 1000);
  return response;
}
