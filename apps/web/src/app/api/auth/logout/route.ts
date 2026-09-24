import { NextResponse, type NextRequest } from 'next/server';
import { isSameOrigin } from '@/lib/server/auth/request';
import { clearCookie, SESSION_COOKIE } from '@/lib/server/auth/session';
import { getWebServices } from '@/lib/server/services';

/** Ends the session immediately: the row is deleted, so the cookie is dead on the next request. */
export async function POST(request: NextRequest) {
  const { config, sessions } = await getWebServices();
  if (!isSameOrigin(request.headers, config.DASHBOARD_URL)) {
    return new NextResponse('Forbidden', { status: 403 });
  }

  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (token) await sessions.revoke(token);

  const response = NextResponse.redirect(new URL('/', config.DASHBOARD_URL), 303);
  clearCookie(response, SESSION_COOKIE);
  return response;
}
