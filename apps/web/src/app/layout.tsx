import type { Metadata } from 'next';
import { connection } from 'next/server';
import type { ReactNode } from 'react';
import './globals.css';

export const metadata: Metadata = {
  title: 'Ririko Dashboard',
  description: 'Manage Ririko AI for your Discord servers.',
};

/**
 * Every page renders per request: the CSP nonce set in proxy.ts only reaches Next.js scripts in
 * dynamic renders, so a prerendered page (such as the 404 page) would have its scripts blocked.
 */
export default async function RootLayout({ children }: { children: ReactNode }) {
  await connection();
  return (
    <html lang="en">
      <body className="min-h-dvh antialiased">{children}</body>
    </html>
  );
}
