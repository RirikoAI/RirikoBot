import { describe, expect, it, vi } from 'vitest';
import { elements, render, textOf } from '../../../../tests/support/markup';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), replace: vi.fn() }) }));
vi.mock('@/app/account/security/actions', () => ({
  beginPasskeyRegistration: vi.fn(),
  finishPasskeyRegistration: vi.fn(),
  removePasskey: vi.fn(),
}));
vi.mock('@/app/account/sessions/actions', () => ({
  revokeSession: vi.fn(),
  revokeOtherSessions: vi.fn(),
}));
vi.mock('@/app/verify/actions', () => ({
  beginPasskeyCheck: vi.fn(),
  finishPasskeyCheck: vi.fn(),
}));
vi.mock('@simplewebauthn/browser', () => ({
  startAuthentication: vi.fn(),
  startRegistration: vi.fn(),
}));

const { LocalTime } = await import('./local-time');
const { PasskeyManager } = await import('./passkeys/passkey-manager');
const { PasskeyCheckButton } = await import('./passkeys/passkey-check-button');
const { SessionList } = await import('./session-list');

describe('LocalTime', () => {
  it('renders UTC on the server so the first paint matches the browser before it switches', () => {
    const html = render(<LocalTime value="2026-10-03T14:05:00Z" />);
    expect(html).toBe('<time dateTime="2026-10-03T14:05:00Z">3 Oct 2026, 14:05 UTC</time>');
  });
});

describe('PasskeyManager', () => {
  it('warns that Discord alone protects the account when there is no passkey', () => {
    const text = textOf(render(<PasskeyManager passkeys={[]} />));
    expect(text).toContain(
      'You have no passkeys. Anyone who gets into your Discord account can use this dashboard.',
    );
    expect(text).toContain('Add a passkey');
  });

  it('lists passkeys with where they live and when they were last used', () => {
    const html = render(
      <PasskeyManager
        passkeys={[
          {
            id: 'p1',
            name: 'Laptop',
            synced: false,
            createdAt: '2026-09-01T10:00:00Z',
            lastUsedAt: '2026-10-02T08:30:00Z',
          },
          {
            id: 'p2',
            name: 'Phone',
            synced: true,
            createdAt: '2026-09-15T10:00:00Z',
            lastUsedAt: null,
          },
        ]}
      />,
    );
    const text = textOf(html);
    expect(text).toContain(
      'Laptop This device only · added 1 Sept 2026, 10:00 UTC · last used 2 Oct 2026, 08:30 UTC',
    );
    expect(text).toContain('Phone Synced passkey · added 15 Sept 2026, 10:00 UTC');
    expect(text).not.toContain('Phone Synced passkey · added 15 Sept 2026, 10:00 UTC · last used');
    expect(html.match(/>Remove<\/button>/g)).toHaveLength(2);
    expect(elements(html, 'input')[0]).toMatchObject({
      id: 'passkey-name',
      maxLength: '64',
      required: '',
    });
  });
});

describe('PasskeyCheckButton', () => {
  it('offers the passkey prompt', () => {
    const html = render(<PasskeyCheckButton returnTo="/dashboard" />);
    expect(html).toMatch(/<button[^>]*>Use my passkey<\/button>/);
    expect(html).not.toContain('role="alert"');
  });
});

describe('SessionList', () => {
  const sessions = [
    {
      id: 's1',
      current: true,
      browser: 'Firefox on Windows',
      userAgent: 'UA-1',
      ipAddress: '203.0.113.7',
      createdAt: '2026-10-01T09:00:00Z',
      lastSeenAt: '2026-10-03T09:00:00Z',
    },
    {
      id: 's2',
      current: false,
      browser: 'Chrome on Android',
      userAgent: null,
      ipAddress: null,
      createdAt: '2026-09-20T09:00:00Z',
      lastSeenAt: '2026-09-30T18:15:00Z',
    },
  ];

  it('marks this browser, gives the others a sign-out button and offers to sign out everywhere else', () => {
    const html = render(<SessionList sessions={sessions} />);
    const text = textOf(html);
    expect(text).toContain('Firefox on Windows This browser');
    expect(text).toContain('203.0.113.7 · signed in 1 Oct 2026, 09:00 UTC · active now');
    expect(text).toContain(
      'Unknown IP address · signed in 20 Sept 2026, 09:00 UTC · last active 30 Sept 2026, 18:15 UTC',
    );
    expect(html.match(/>Sign out<\/button>/g)).toHaveLength(1);
    expect(text).toContain('Sign out everywhere else');
    expect(html).toContain('title="UA-1"');
  });

  it('does not offer to sign out others when this is the only session', () => {
    const html = render(<SessionList sessions={[sessions[0]!]} />);
    expect(textOf(html)).not.toContain('Sign out');
  });
});
