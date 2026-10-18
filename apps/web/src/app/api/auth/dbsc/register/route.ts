import { NextResponse, type NextRequest } from 'next/server';
import { BOUND_COOKIE, BOUND_COOKIE_TTL_MS, sessionInstructions } from '@/lib/server/auth/dbsc';
import { SESSION_COOKIE, setCookie } from '@/lib/server/auth/session';
import { limitAuthRequest } from '@/lib/server/rate-limit';
import { getWebServices } from '@/lib/server/services';

const NO_STORE = { 'Cache-Control': 'no-store' };

/**
 * DBSC registration (STORY-119). The browser posts a `dbsc+jwt` proof in `Secure-Session-Response`
 * after the sign-in response carried `Secure-Session-Registration`. The proof is the
 * authentication, so there is no same-origin check; the session cookie must still be present.
 */
export async function POST(request: NextRequest) {
  const limited = limitAuthRequest(request);
  if (limited) return limited;
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (!token) return new NextResponse('No session', { status: 401, headers: NO_STORE });
  const proof = request.headers.get('secure-session-response');
  if (!proof) return new NextResponse('Missing proof', { status: 400, headers: NO_STORE });

  const { sessions } = await getWebServices();
  const result = await sessions.bindDevice(token, proof);
  if (result.kind === 'no_session') {
    return new NextResponse('No session', { status: 401, headers: NO_STORE });
  }
  if (result.kind !== 'bound') {
    return new NextResponse('Registration refused', { status: 400, headers: NO_STORE });
  }

  const response = NextResponse.json(sessionInstructions(result.sid), { headers: NO_STORE });
  const maxAge = Math.max(0, Math.floor((result.session.expiresAt.getTime() - Date.now()) / 1000));
  setCookie(response, SESSION_COOKIE, result.token, maxAge);
  setCookie(response, BOUND_COOKIE, result.boundCookie, BOUND_COOKIE_TTL_MS / 1000);
  return response;
}
