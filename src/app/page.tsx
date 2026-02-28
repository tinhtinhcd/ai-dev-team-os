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
        <div className="flex flex-wrap items-center justify-center gap-4">
          <a
            href="/brain"
            className="rounded-lg bg-violet-600 px-6 py-3 font-medium text-white hover:bg-violet-500 transition-colors"
          >
            Open Brain Panel
          </a>
          <a
            href="/integrations"
            className="rounded-lg border border-zinc-600 px-6 py-3 font-medium text-zinc-200 hover:bg-zinc-800 transition-colors"
          >
            Connect your tools
          </a>
        </div>
      </main>
    </div>
  );
}
