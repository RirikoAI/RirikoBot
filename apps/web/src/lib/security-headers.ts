// Used by next.config.ts and proxy.ts, so no `server-only` import: neither runs as a Server
// Component.

/**
 * Nonce-based CSP (ADR-013). Next.js reads the nonce from the request's CSP header and adds it
 * to its own scripts; `'strict-dynamic'` lets those scripts load the rest, so no inline script
 * runs without the nonce. Development needs `eval` and inline styles for React's debugging aids.
 */
export function contentSecurityPolicy(nonce: string, development: boolean): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${development ? " 'unsafe-eval'" : ''}`,
    `style-src 'self' ${development ? "'unsafe-inline'" : `'nonce-${nonce}'`}`,
    "img-src 'self' https://cdn.discordapp.com data: blob:",
    "font-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; ');
}

/** Headers that do not change per request, sent on every response. */
export function staticSecurityHeaders(production: boolean): { key: string; value: string }[] {
  return [
    { key: 'X-Content-Type-Options', value: 'nosniff' },
    { key: 'Referrer-Policy', value: 'same-origin' },
    // No popups are used (WebAuthn prompts are browser UI), so the window can be fully isolated.
    { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
    {
      key: 'Permissions-Policy',
      value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()',
    },
    // Browsers ignore HSTS over plain HTTP, and development runs on http://localhost.
    ...(production
      ? [{ key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' }]
      : []),
  ];
}
