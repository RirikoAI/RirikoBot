import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  headers: new Headers(),
  cookie: undefined as string | undefined,
  userId: 'user-1',
}));

vi.mock('next/headers', () => ({
  headers: async () => mocks.headers,
  cookies: async () => ({ get: () => (mocks.cookie ? { value: mocks.cookie } : undefined) }),
}));
vi.mock('./services', () => ({
  getWebServices: async () => ({
    config: { DASHBOARD_URL: 'https://dash.example.com' },
    sessions: { resolve: async () => ({ userId: mocks.userId }) },
  }),
}));

const { checkDashboardRequest } = await import('./request-context');

describe('checkDashboardRequest (TASK-1173)', () => {
  beforeEach(() => {
    mocks.cookie = undefined;
    mocks.headers = new Headers({
      origin: 'https://dash.example.com',
      'x-forwarded-for': '203.0.113.50',
    });
  });

  it('refuses requests from another origin', async () => {
    mocks.headers = new Headers({ origin: 'https://evil.example' });
    expect(await checkDashboardRequest()).toBe('This request did not come from the dashboard.');
  });

  it('rate limits each signed-in user separately, whatever their IP', async () => {
    mocks.cookie = 'x'.repeat(43);
    mocks.userId = 'busy-user';
    const results = [];
    for (let index = 0; index < 31; index += 1) {
      mocks.headers = new Headers({
        origin: 'https://dash.example.com',
        'x-forwarded-for': `203.0.113.${index}`,
      });
      results.push(await checkDashboardRequest());
    }
    expect(results.slice(0, 30).every((result) => result === null)).toBe(true);
    expect(results[30]).toMatch(/Too many requests/);

    mocks.userId = 'calm-user';
    expect(await checkDashboardRequest()).toBeNull();
  });

  it('rate limits by client IP before sign-in', async () => {
    const results = [];
    for (let index = 0; index < 31; index += 1) results.push(await checkDashboardRequest());
    expect(results.at(-1)).toMatch(/Too many requests/);

    mocks.headers = new Headers({
      origin: 'https://dash.example.com',
      'x-forwarded-for': '203.0.113.51',
    });
    expect(await checkDashboardRequest()).toBeNull();
  });
});
