import { describe, expect, it } from 'vitest';
import { clientIp, DEFAULT_RETURN_TO, isSameOrigin, sanitizeReturnTo } from './request';

describe('sanitizeReturnTo', () => {
  it('keeps same-site paths with query and hash', () => {
    expect(sanitizeReturnTo('/dashboard/123?tab=general#top')).toBe(
      '/dashboard/123?tab=general#top',
    );
  });

  it.each([
    null,
    '',
    'https://evil.example/',
    '//evil.example/path',
    '/\\evil.example',
    '\\\\evil.example',
    'javascript:alert(1)',
    '/api/auth/logout',
  ])('falls back to the server list for %s', (value) => {
    expect(sanitizeReturnTo(value)).toBe(DEFAULT_RETURN_TO);
  });

  it('normalises dot segments without leaving the site', () => {
    expect(sanitizeReturnTo('/servers/../dashboard/1')).toBe('/dashboard/1');
  });
});

describe('clientIp', () => {
  it('prefers the first X-Forwarded-For hop, then X-Real-IP', () => {
    expect(clientIp(new Headers({ 'x-forwarded-for': '203.0.113.7, 10.0.0.1' }))).toBe(
      '203.0.113.7',
    );
    expect(clientIp(new Headers({ 'x-real-ip': '198.51.100.2' }))).toBe('198.51.100.2');
    expect(clientIp(new Headers())).toBeNull();
  });
});

describe('isSameOrigin', () => {
  it('accepts only the exact dashboard origin', () => {
    const origin = 'https://dash.example.com';
    expect(isSameOrigin(new Headers({ origin }), origin)).toBe(true);
    expect(isSameOrigin(new Headers({ origin: 'https://evil.example' }), origin)).toBe(false);
    expect(isSameOrigin(new Headers({ origin: 'null' }), origin)).toBe(false);
    expect(isSameOrigin(new Headers(), origin)).toBe(false);
  });
});
