import { after, NextResponse, type NextRequest } from 'next/server';
import { OAuth2Scopes } from 'discord-api-types/v10';
import { openPendingInvite } from '@/lib/server/auth/oauth-state';
import { clearCookie, getSession, INVITE_COOKIE } from '@/lib/server/auth/session';
import { guildIconUrl, userAvatarUrl } from '@/lib/server/discord-cdn';
import { limitAuthRequest } from '@/lib/server/rate-limit';
import { getWebServices } from '@/lib/server/services';
import type { LoginError } from '@/lib/login-errors';

/**
 * Completes the bot invite (TASK-1841). With Requires OAuth2 Code Grant on, Discord adds the bot
 * only after this exchange succeeds, so the server's inviter is the user who authorized it. The
 * flow records the server and inviter, drops the user token and never creates a session: a
 * visitor who is not signed in lands on the Servers page, which asks them to sign in.
 */
export async function GET(request: NextRequest) {
  const limited = limitAuthRequest(request);
  if (limited) return limited;
  const { config, guildRegistry, inviteOauth, users, vault } = await getWebServices();
  const params = request.nextUrl.searchParams;

  const redirect = (path: string) => {
    const response = NextResponse.redirect(new URL(path, config.DASHBOARD_URL), 303);
    clearCookie(response, INVITE_COOKIE);
    return response;
  };
  const fail = (error: LoginError) => redirect(`/?error=${error}`);

  if (params.get('error')) return fail('invite_cancelled');
  const code = params.get('code');
  const state = params.get('state');
  const sealed = request.cookies.get(INVITE_COOKIE)?.value;
  const now = new Date();
  const pending = code && state && sealed ? openPendingInvite(vault, sealed, state, now) : null;
  if (!code || !pending) return fail('invite_invalid_state');

  try {
    const { tokens, guild } = await inviteOauth.exchangeInviteCode(code, pending.codeVerifier, now);
    // The user token is only needed to read the profile; drop it once this request is answered.
    after(() =>
      inviteOauth.revokeToken(tokens.accessToken).catch((error: unknown) => {
        console.error(
          '[web] Could not revoke an invite token:',
          error instanceof Error ? error.message : error,
        );
      }),
    );
    if (!guild) return fail('invite_no_server');
    // Only `identify` is checked: Discord need not list `bot` in `scope`, and the `guild` object
    // above already proves the bot was authorized.
    if (!tokens.scopes.includes(OAuth2Scopes.Identify)) return fail('invite_failed');

    const user = await inviteOauth.getCurrentUser(tokens.accessToken);
    await users.upsert({
      id: user.id,
      username: user.username,
      displayName: user.global_name,
      avatarUrl: userAvatarUrl(user),
    });
    await guildRegistry.recordInvite(
      {
        id: guild.id,
        name: guild.name,
        iconUrl: guildIconUrl({ id: guild.id, icon: guild.icon }),
        ownerId: guild.ownerId,
        joinedAt: now,
      },
      user.id,
    );

    // A signed-in user goes straight to the new server; a read failure only means the Servers page.
    const signedIn = await getSession().then(
      (session) => session !== null,
      () => false,
    );
    return redirect(signedIn ? `/dashboard/${guild.id}` : `/servers?invited=${guild.id}`);
  } catch (error) {
    console.error('[web] Discord invite failed:', error instanceof Error ? error.message : error);
    return fail('invite_failed');
  }
}
