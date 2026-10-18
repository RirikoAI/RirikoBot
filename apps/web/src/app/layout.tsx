import type { Metadata } from 'next';
import localFont from 'next/font/local';
import { connection } from 'next/server';
import type { ReactNode } from 'react';
import './globals.css';

export const metadata: Metadata = {
  title: 'Ririko Dashboard',
  description: 'Manage Ririko AI for your Discord servers.',
};

// Self-hosted brand fonts (STORY-195), SIL Open Font License, see ./fonts. The latin-ext subsets
// are declared in globals.css, because next/font/local cannot set a unicode-range per file.
const libreFranklin = localFont({
  src: './fonts/libre-franklin-latin.woff2',
  weight: '400 800',
  variable: '--font-libre-franklin',
  display: 'swap',
});

const sourGummy = localFont({
  src: './fonts/sour-gummy-latin.woff2',
  weight: '400 800',
  variable: '--font-sour-gummy',
  display: 'swap',
});

/**
 * Every page renders per request: the CSP nonce set in proxy.ts only reaches Next.js scripts in
 * dynamic renders, so a prerendered page (such as the 404 page) would have its scripts blocked.
 */
export default async function RootLayout({ children }: { children: ReactNode }) {
  await connection();
  return (
    <html lang="en" className={`${libreFranklin.variable} ${sourGummy.variable}`}>
      <body className="min-h-dvh font-sans antialiased">{children}</body>
    </html>
  );
}
