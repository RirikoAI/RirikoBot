import { NextResponse, type NextRequest } from 'next/server';
import { DASHBOARD_OAUTH_SCOPES } from '@/lib/server/auth/discord-oauth';
import { openPendingLogin } from '@/lib/server/auth/oauth-state';
import { clientIp, userAgent } from '@/lib/server/auth/request';
import { clearCookie, OAUTH_COOKIE, SESSION_COOKIE, setCookie } from '@/lib/server/auth/session';
import { userAvatarUrl } from '@/lib/server/discord-cdn';
import { getWebServices } from '@/lib/server/services';
import type { LoginError } from '@/lib/login-errors';

/** Completes Discord OAuth2 and starts a fresh server-side session. */
export async function GET(request: NextRequest) {
  const { config, oauth, sessions, users, vault } = await getWebServices();
  const params = request.nextUrl.searchParams;

  const fail = (error: LoginError) => {
    const response = NextResponse.redirect(new URL(`/?error=${error}`, config.DASHBOARD_URL), 303);
    clearCookie(response, OAUTH_COOKIE);
    return response;
  };

  if (params.get('error')) return fail('access_denied');
  const code = params.get('code');
  const state = params.get('state');
  const sealed = request.cookies.get(OAUTH_COOKIE)?.value;
  const now = new Date();
  const pending = code && state && sealed ? openPendingLogin(vault, sealed, state, now) : null;
  if (!code || !pending) return fail('invalid_state');

  try {
    const tokens = await oauth.exchangeCode(code, pending.codeVerifier, now);
    if (!DASHBOARD_OAUTH_SCOPES.every((scope) => tokens.scopes.includes(scope))) {
      return fail('missing_scope');
    }
    const user = await oauth.getCurrentUser(tokens.accessToken);
    await users.upsert({
      id: user.id,
      username: user.username,
      displayName: user.global_name,
      avatarUrl: userAvatarUrl(user),
    });

    const { token, session } = await sessions.create({
      userId: user.id,
      tokens,
      ipAddress: clientIp(request.headers),
      userAgent: userAgent(request.headers),
      replacesToken: request.cookies.get(SESSION_COOKIE)?.value,
    });

    const response = NextResponse.redirect(new URL(pending.returnTo, config.DASHBOARD_URL), 303);
    setCookie(
      response,
      SESSION_COOKIE,
      token,
      Math.floor((session.expiresAt.getTime() - now.getTime()) / 1000),
    );
    clearCookie(response, OAUTH_COOKIE);
    return response;
  } catch (error) {
    console.error('[web] Discord login failed:', error instanceof Error ? error.message : error);
    return fail('login_failed');
  }
}
