export default function IntegrationsPage() {
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      {/* Hero: Connect your tools */}
      <section className="relative overflow-hidden">
        <div
          className="absolute inset-0 bg-gradient-to-br from-indigo-600/40 via-violet-600/30 to-amber-500/30"
          aria-hidden
        />
        <div className="relative flex flex-col items-center justify-center px-6 py-24 text-center">
          <div className="mb-6 flex items-center justify-center gap-6">
            <div className="flex h-16 w-16 items-center justify-center rounded-full border-2 border-white/90 bg-white/10 backdrop-blur-sm">
              <svg
                viewBox="0 0 24 24"
                className="h-8 w-8 text-white"
                fill="currentColor"
                aria-hidden
              >
                <path d="M4 4l6 8 6-8h4l-8 10 8 10h-4l-6-8-6 8H2L10 12 2 2h4z" />
              </svg>
            </div>
            <div className="flex h-16 w-16 items-center justify-center rounded-full border-2 border-white/90 bg-white/10 backdrop-blur-sm">
              <svg
                viewBox="0 0 24 24"
                className="h-8 w-8 text-white"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                aria-hidden
              >
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
            </div>
          </div>
          <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
            Connect your tools
          </h1>
          <p className="mt-4 max-w-2xl text-lg text-zinc-300">
            Integrations turn AI Dev Team OS into your source of truth around
            product development. Keep data in sync, and eliminate manual updates
            between tools.
          </p>
        </div>
      </section>

      {/* Key integrations */}
      <section className="mx-auto max-w-4xl px-6 py-16">
        <h2 className="mb-8 text-2xl font-semibold tracking-tight">
          Key integrations
        </h2>
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          <IntegrationCard
            title="Slack (Van Bot)"
            description="Mention @Van Bot with task: &lt;title&gt; to create Linear issues, auto-assign to Cursor, and get confirmation in thread"
            href="https://api.slack.com/apps"
          />
          <IntegrationCard
            title="GitHub / GitLab"
            description="Automate your pull request, commit workflows, and keep issues synced both ways"
            href="https://linear.app/settings/integrations/github"
          />
          <IntegrationCard
            title="Agents"
            description="Deploy AI agents that work alongside you as teammates"
            href="https://linear.app/integrations/agents"
          />
        </div>
      </section>

      {/* Browse all integrations */}
      <section className="border-t border-zinc-800 bg-zinc-900/40 px-6 py-16">
        <div className="mx-auto max-w-4xl text-center">
          <h2 className="mb-4 text-2xl font-semibold tracking-tight">
            Browse all integrations
          </h2>
          <p className="mb-6 text-zinc-400">
            Discover 150+ available connections in our integration directory –
            from bug creation via support tools (Intercom, Zendesk), to issues
            created from design explorations (Figma).
          </p>
          <a
            href="https://linear.app/integrations"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-lg bg-violet-600 px-6 py-3 font-medium text-white hover:bg-violet-500 transition-colors"
          >
            Explore integration directory
            <svg
              className="h-4 w-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
              />
            </svg>
          </a>
        </div>
      </section>

      {/* Linear API */}
      <section className="mx-auto max-w-4xl px-6 py-16">
        <h2 className="mb-4 text-2xl font-semibold tracking-tight">
          Linear API
        </h2>
        <p className="mb-6 text-zinc-400">
          If you need something more custom, you can build directly on the
          Linear API (built on GraphQL).
        </p>
        <a
          href="https://linear.app/developers"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 text-violet-400 hover:text-violet-300 transition-colors"
        >
          See our Dev Docs to learn more
          <svg
            className="h-4 w-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 5l7 7-7 7"
            />
          </svg>
        </a>
      </section>

      {/* Back to home */}
      <footer className="border-t border-zinc-800 px-6 py-8">
        <div className="mx-auto max-w-4xl">
          <a
            href="/"
            className="text-sm text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            ← Back to AI Dev Team OS
          </a>
        </div>
      </footer>
    </div>
  );
}

function IntegrationCard({
  title,
  description,
  href,
}: {
  title: string;
  description: string;
  href: string;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="group rounded-xl border border-zinc-800 bg-zinc-900/60 p-6 transition-colors hover:border-violet-600/50 hover:bg-zinc-900"
    >
      <h3 className="font-semibold text-violet-300 group-hover:text-violet-200">
        {title}
      </h3>
      <p className="mt-2 text-sm text-zinc-400">{description}</p>
    </a>
  );
}
