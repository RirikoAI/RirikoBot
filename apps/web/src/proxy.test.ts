import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { contentSecurityPolicy, staticSecurityHeaders } from '@/lib/security-headers';
import { proxy } from './proxy';

describe('browser hardening headers (TASK-1173)', () => {
  it('sends a fresh nonce CSP on the request (for Next.js) and the response', () => {
    const first = proxy(new NextRequest('https://dash.example.com/servers'));
    const second = proxy(new NextRequest('https://dash.example.com/servers'));

    const policy = first.headers.get('content-security-policy') ?? '';
    const nonce = /'nonce-([^']+)'/.exec(policy)?.[1];
    expect(nonce).toMatch(/^[A-Za-z0-9+/]{22}==$/);
    expect(second.headers.get('content-security-policy')).not.toContain(nonce);
    // NextResponse.next forwards overridden request headers to the render.
    expect(first.headers.get('x-middleware-request-content-security-policy')).toBe(policy);
  });

  it('allows no inline scripts, framing or foreign form targets in production', () => {
    const policy = contentSecurityPolicy('abc', false);
    expect(policy).toContain("script-src 'self' 'nonce-abc' 'strict-dynamic'");
    expect(policy).not.toContain('unsafe-inline');
    expect(policy).not.toContain('unsafe-eval');
    expect(policy).toContain("frame-ancestors 'none'");
    expect(policy).toContain("form-action 'self'");
    expect(policy).toContain("object-src 'none'");
    expect(policy).toContain("base-uri 'self'");
    expect(policy).toContain("img-src 'self' https://cdn.discordapp.com data: blob:");
  });

  it('sends HSTS only in production', () => {
    const keys = (production: boolean) =>
      staticSecurityHeaders(production).map((header) => header.key);
    expect(keys(true)).toEqual([
      'X-Content-Type-Options',
      'Referrer-Policy',
      'Cross-Origin-Opener-Policy',
      'Permissions-Policy',
      'Strict-Transport-Security',
    ]);
    expect(keys(false)).not.toContain('Strict-Transport-Security');
  });
});
