export default function Home() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-950 text-zinc-100">
      <main className="flex flex-col items-center gap-8 text-center">
        <h1 className="text-3xl font-semibold tracking-tight">
          AI Dev Team OS
        </h1>
        <p className="max-w-md text-zinc-400">
          Local-first development workspace. Manage product vision, backlog,
          decisions, and tech stack in one place.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <a
            href="/brain"
            className="rounded-lg bg-violet-600 px-6 py-3 font-medium text-white transition-colors hover:bg-violet-500"
          >
            Open Brain Panel
          </a>
          <a
            href="/observability"
            className="rounded-lg border border-zinc-700 px-6 py-3 font-medium text-zinc-200 transition-colors hover:bg-zinc-800"
          >
            Open Observability
          </a>
        </div>
      </main>
    </div>
  );
}
