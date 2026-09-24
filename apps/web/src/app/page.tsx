export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col items-center justify-center gap-6 px-4 text-center">
      <h1 className="text-4xl font-bold tracking-tight">
        Ririko <span className="text-sakura">Dashboard</span>
      </h1>
      <p className="max-w-xl text-lg text-zinc-400">
        Configure Ririko AI for the Discord servers you manage.
      </p>
    </main>
  );
}
