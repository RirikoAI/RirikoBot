import { afterEach, describe, expect, it, vi } from 'vitest';
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

describe('clientIp with CLIENT_IP_HEADER', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('reads only the configured header and ignores a spoofed X-Forwarded-For', () => {
    vi.stubEnv('CLIENT_IP_HEADER', 'cf-connecting-ip');
    const headers = new Headers({
      'cf-connecting-ip': '198.51.100.9',
      'x-forwarded-for': '203.0.113.7, 198.51.100.9',
      'x-real-ip': '192.0.2.1',
    });
    expect(clientIp(headers)).toBe('198.51.100.9');
  });

  it('returns null for a value that is not an IP address, without falling back', () => {
    vi.stubEnv('CLIENT_IP_HEADER', 'cf-connecting-ip');
    const headers = new Headers({
      'cf-connecting-ip': 'not-an-ip',
      'x-forwarded-for': '203.0.113.7',
    });
    expect(clientIp(headers)).toBeNull();
  });

  it('returns null when the header is missing, without falling back', () => {
    vi.stubEnv('CLIENT_IP_HEADER', 'cf-connecting-ip');
    expect(clientIp(new Headers({ 'x-forwarded-for': '203.0.113.7' }))).toBeNull();
    expect(clientIp(new Headers({ 'x-real-ip': '203.0.113.7' }))).toBeNull();
  });

  it('accepts IPv6 addresses', () => {
    vi.stubEnv('CLIENT_IP_HEADER', 'cf-connecting-ip');
    expect(clientIp(new Headers({ 'cf-connecting-ip': '2001:db8::1' }))).toBe('2001:db8::1');
  });

  it('matches the header name case-insensitively and trims the value', () => {
    vi.stubEnv('CLIENT_IP_HEADER', '  CF-Connecting-IP ');
    expect(clientIp(new Headers({ 'cf-connecting-ip': ' 198.51.100.9 ' }))).toBe('198.51.100.9');
  });

  it('fails closed when the variable is malformed', () => {
    vi.stubEnv('CLIENT_IP_HEADER', 'bad header');
    expect(clientIp(new Headers({ 'x-forwarded-for': '203.0.113.7' }))).toBeNull();
  });

  it('follows a changed value and treats a blank one as unset', () => {
    vi.stubEnv('CLIENT_IP_HEADER', 'x-client-ip');
    expect(clientIp(new Headers({ 'x-client-ip': '192.0.2.5' }))).toBe('192.0.2.5');
    vi.stubEnv('CLIENT_IP_HEADER', '');
    expect(clientIp(new Headers({ 'x-forwarded-for': '203.0.113.7' }))).toBe('203.0.113.7');
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
