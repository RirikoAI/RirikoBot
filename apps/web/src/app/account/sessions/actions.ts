'use server';

import { revalidatePath } from 'next/cache';
import { requireSession } from '@/lib/server/auth/session';
import { checkDashboardRequest, requestActor } from '@/lib/server/request-context';
import { getWebServices } from '@/lib/server/services';

const PAGE = '/account/sessions';
const SESSION_ID_PATTERN = /^[0-9a-f]{64}$/;

type SessionActionResult = { ok: true } | { ok: false; error: string };

const UNKNOWN_SESSION: SessionActionResult = {
  ok: false,
  error: 'That session has already ended.',
};

/**
 * Signs out one of the user's other sessions. Revoking is defensive, so it needs no fresh
 * passkey check: a user must always be able to end a stolen session.
 */
export async function revokeSession(sessionId: unknown): Promise<SessionActionResult> {
  const rejected = await checkDashboardRequest();
  if (rejected) return { ok: false, error: rejected };
  const session = await requireSession(PAGE);
  if (typeof sessionId !== 'string' || !SESSION_ID_PATTERN.test(sessionId)) {
    return UNKNOWN_SESSION;
  }
  if (sessionId === session.id) {
    return { ok: false, error: 'Use Sign out in the header to end this session.' };
  }

  const { sessions } = await getWebServices();
  if (!(await sessions.revokeForUser(session.userId, sessionId))) return UNKNOWN_SESSION;
  await audit(session.userId, 'web.session.revoke', { sessionId });
  revalidatePath(PAGE);
  return { ok: true };
}

/** Signs out every session of the user except this one. */
export async function revokeOtherSessions(): Promise<SessionActionResult> {
  const rejected = await checkDashboardRequest();
  if (rejected) return { ok: false, error: rejected };
  const session = await requireSession(PAGE);

  const { sessions } = await getWebServices();
  const ended = await sessions.revokeOthers(session);
  await audit(session.userId, 'web.session.revoke_all', { ended });
  revalidatePath(PAGE);
  return { ok: true };
}

async function audit(userId: string, action: string, details: Record<string, unknown>) {
  const { audit: auditLog } = await getWebServices();
  await auditLog.create(
    {
      guildId: null,
      actorUserId: userId,
      action,
      details: { source: 'dashboard', ...details },
      ...(await requestActor()),
    },
    new Date(),
  );
}
