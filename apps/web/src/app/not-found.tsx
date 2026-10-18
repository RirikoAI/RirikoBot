import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col items-center justify-center gap-4 px-4 text-center">
      <h1 className="text-2xl font-bold">Not found</h1>
      <p className="text-zinc-400">
        This page does not exist, or you do not have access to this server.
      </p>
      <Link href="/servers" className="text-sakura hover:underline">
        Back to your servers
      </Link>
    </main>
  );
}
