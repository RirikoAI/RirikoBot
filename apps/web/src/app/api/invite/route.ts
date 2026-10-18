import { NextResponse, type NextRequest } from 'next/server';
import { createPkcePair, randomToken } from '@/lib/server/auth/discord-oauth';
import { OAUTH_STATE_TTL_MS, sealPendingInvite } from '@/lib/server/auth/oauth-state';
import { INVITE_COOKIE, setCookie } from '@/lib/server/auth/session';
import { BOT_INVITE_PERMISSIONS } from '@/lib/server/guilds/permissions';
import { limitAuthRequest } from '@/lib/server/rate-limit';
import { getWebServices } from '@/lib/server/services';

const SNOWFLAKE = /^\d{17,20}$/;

/**
 * Starts the bot invite (TASK-1841): Discord OAuth2 with the `bot` scope, so the callback learns
 * which user authorized the bot. It needs no dashboard session, so the Developer Portal install
 * link can point here. `?guild=<id>` pre-selects a server; anything else is ignored.
 */
export async function GET(request: NextRequest) {
  const limited = limitAuthRequest(request);
  if (limited) return limited;
  const { inviteOauth, vault } = await getWebServices();
  const guild = request.nextUrl.searchParams.get('guild');
  const guildId = guild && SNOWFLAKE.test(guild) ? guild : null;
  const state = randomToken();
  const { verifier, challenge } = createPkcePair();
  const sealed = sealPendingInvite(vault, {
    state,
    codeVerifier: verifier,
    guildId,
    issuedAt: Date.now(),
  });

  const response = NextResponse.redirect(
    inviteOauth.inviteUrl({
      state,
      codeChallenge: challenge,
      permissions: BOT_INVITE_PERMISSIONS,
      guildId: guildId ?? undefined,
    }),
  );
  setCookie(response, INVITE_COOKIE, sealed, OAUTH_STATE_TTL_MS / 1000);
  return response;
}
