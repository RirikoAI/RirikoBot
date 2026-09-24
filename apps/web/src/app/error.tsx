'use client';

export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col items-center justify-center gap-4 px-4 text-center">
      <h1 className="text-2xl font-bold">Something went wrong</h1>
      <p className="text-zinc-400">Discord may be busy. Please try again in a moment.</p>
      <button
        type="button"
        onClick={reset}
        className="rounded-md bg-sakura-strong px-4 py-2 font-semibold text-white hover:bg-sakura"
      >
        Try again
      </button>
    </main>
  );
}
