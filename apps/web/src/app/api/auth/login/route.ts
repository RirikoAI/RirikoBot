import { NextResponse, type NextRequest } from 'next/server';
import { createPkcePair, randomToken } from '@/lib/server/auth/discord-oauth';
import { OAUTH_STATE_TTL_MS, sealPendingLogin } from '@/lib/server/auth/oauth-state';
import { sanitizeReturnTo } from '@/lib/server/auth/request';
import { OAUTH_COOKIE, setCookie } from '@/lib/server/auth/session';
import { getWebServices } from '@/lib/server/services';

/** Starts Discord OAuth2: the state and PKCE verifier travel in a sealed, short-lived cookie. */
export async function GET(request: NextRequest) {
  const { oauth, vault } = await getWebServices();
  const state = randomToken();
  const { verifier, challenge } = createPkcePair();
  const sealed = sealPendingLogin(vault, {
    state,
    codeVerifier: verifier,
    returnTo: sanitizeReturnTo(request.nextUrl.searchParams.get('returnTo')),
    issuedAt: Date.now(),
  });

  const response = NextResponse.redirect(
    oauth.authorizationUrl({ state, codeChallenge: challenge }),
  );
  setCookie(response, OAUTH_COOKIE, sealed, OAUTH_STATE_TTL_MS / 1000);
  return response;
}
