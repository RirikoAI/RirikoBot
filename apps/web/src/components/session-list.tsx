'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { revokeOtherSessions, revokeSession } from '@/app/account/sessions/actions';
import { LocalTime } from './local-time';

export interface SessionEntry {
  id: string;
  current: boolean;
  browser: string;
  userAgent: string | null;
  ipAddress: string | null;
  createdAt: string;
  lastSeenAt: string;
}

export function SessionList({ sessions }: { sessions: SessionEntry[] }) {
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const others = sessions.filter((session) => !session.current).length;

  async function run(
    key: string,
    action: () => Promise<{ ok: true } | { ok: false; error: string }>,
  ) {
    setPending(key);
    setError(null);
    const result = await action();
    setPending(null);
    if (!result.ok) setError(result.error);
    router.refresh();
  }

  function revokeOthers() {
    if (!window.confirm(`Sign out ${others} other ${others === 1 ? 'session' : 'sessions'}?`)) {
      return;
    }
    void run('others', revokeOtherSessions);
  }

  return (
    <div className="flex flex-col gap-6">
      <ul className="flex flex-col divide-y divide-edge rounded-lg border border-edge bg-panel">
        {sessions.map((session) => (
          <li key={session.id} className="flex flex-wrap items-center gap-4 p-4">
            <div className="min-w-0 flex-1">
              <p className="font-medium" title={session.userAgent ?? undefined}>
                {session.browser}
                {session.current ? (
                  <span className="ml-2 rounded-full bg-sakura-strong px-2 py-0.5 text-xs font-semibold text-white">
                    This browser
                  </span>
                ) : null}
              </p>
              <p className="text-xs text-zinc-400">
                {session.ipAddress ?? 'Unknown IP address'} · signed in{' '}
                <LocalTime value={session.createdAt} /> ·{' '}
                {session.current ? (
                  'active now'
                ) : (
                  <>
                    last active <LocalTime value={session.lastSeenAt} />
                  </>
                )}
              </p>
            </div>
            {session.current ? null : (
              <button
                type="button"
                onClick={() => void run(session.id, () => revokeSession(session.id))}
                disabled={pending !== null}
                className="rounded-md border border-edge px-3 py-1.5 text-sm text-zinc-300 hover:bg-edge disabled:opacity-60"
              >
                {pending === session.id ? 'Signing out…' : 'Sign out'}
              </button>
            )}
          </li>
        ))}
      </ul>

      {others > 0 ? (
        <div>
          <button
            type="button"
            onClick={revokeOthers}
            disabled={pending !== null}
            className="rounded-md bg-sakura-strong px-4 py-2 text-sm font-semibold text-white hover:bg-sakura disabled:opacity-60"
          >
            {pending === 'others' ? 'Signing out…' : 'Sign out everywhere else'}
          </button>
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="text-sm text-red-300">
          {error}
        </p>
      ) : null}
    </div>
  );
}
