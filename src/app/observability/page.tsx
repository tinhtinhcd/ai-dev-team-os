import Link from "next/link";
import {
  getObservabilityData,
  type CallRole,
  type DateRange,
} from "@/lib/observability/usage";

export const dynamic = "force-dynamic";

type SearchParams = {
  range?: string;
  role?: string;
  action?: string;
};

const ROLES: CallRole[] = ["architect", "engineer", "reviewer"];

function formatNumber(value: number): string {
  return new Intl.NumberFormat().format(value);
}

function asRange(range?: string): DateRange {
  return range === "today" ? "today" : "last7";
}

function asRole(role?: string): CallRole | undefined {
  if (!role) return undefined;
  return ROLES.includes(role as CallRole) ? (role as CallRole) : undefined;
}

function asAction(action?: string): string | undefined {
  if (!action) return undefined;
  return action.trim() || undefined;
}

function buildHref(filters: {
  range: DateRange;
  role?: CallRole;
  action?: string;
}): string {
  const params = new URLSearchParams();
  params.set("range", filters.range);
  if (filters.role) params.set("role", filters.role);
  if (filters.action) params.set("action", filters.action);
  const query = params.toString();
  return query ? `/observability?${query}` : "/observability";
}

function badgeClass(active: boolean): string {
  return active
    ? "bg-violet-600/20 text-violet-300 border-violet-500/40"
    : "bg-zinc-900 text-zinc-300 border-zinc-700 hover:bg-zinc-800";
}

export default async function ObservabilityPage(props: {
  searchParams?: Promise<SearchParams>;
}) {
  const searchParams = props.searchParams ? await props.searchParams : {};
  const range = asRange(searchParams.range);
  const role = asRole(searchParams.role);
  const action = asAction(searchParams.action);
  const data = getObservabilityData({ range, role, action });

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <header className="border-b border-zinc-800 bg-zinc-900/70">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">
              AI Dev Team OS · Observability
            </h1>
            <p className="text-sm text-zinc-400">
              Local token and usage analytics from <code>./logs/ai_calls.jsonl</code>
            </p>
          </div>
          <div className="flex gap-2">
            <Link
              href="/"
              className="rounded-lg border border-zinc-700 px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-800"
            >
              Home
            </Link>
            <Link
              href="/brain"
              className="rounded-lg border border-zinc-700 px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-800"
            >
              Brain
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-6">
        {data.logState === "missing_prod" && (
          <section className="rounded-xl border border-amber-700/50 bg-amber-900/20 p-4 text-amber-100">
            <p className="text-sm">
              No log file found at <code>./logs/ai_calls.jsonl</code>. In production mode, the
              dashboard does not auto-seed data. Create the file and append JSONL entries to start
              seeing metrics.
            </p>
          </section>
        )}
        <section className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="text-sm text-zinc-400">Range</span>
              <Link
                href={buildHref({ range: "today", role, action })}
                className={`rounded-full border px-3 py-1 text-sm ${badgeClass(
                  range === "today"
                )}`}
              >
                Today
              </Link>
              <Link
                href={buildHref({ range: "last7", role, action })}
                className={`rounded-full border px-3 py-1 text-sm ${badgeClass(
                  range === "last7"
                )}`}
              >
                Last 7 days
              </Link>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-sm text-zinc-400">Role</span>
              <Link
                href={buildHref({ range, action })}
                className={`rounded-full border px-3 py-1 text-sm ${badgeClass(!role)}`}
              >
                All
              </Link>
              {ROLES.map((r) => (
                <Link
                  key={r}
                  href={buildHref({ range, role: r, action })}
                  className={`rounded-full border px-3 py-1 text-sm ${badgeClass(
                    role === r
                  )}`}
                >
                  {r}
                </Link>
              ))}
            </div>

            <div className="flex items-center gap-2">
              <span className="text-sm text-zinc-400">Action</span>
              <Link
                href={buildHref({ range, role })}
                className={`rounded-full border px-3 py-1 text-sm ${badgeClass(!action)}`}
              >
                All
              </Link>
              {data.availableActions.map((a) => (
                <Link
                  key={a}
                  href={buildHref({ range, role, action: a })}
                  className={`rounded-full border px-3 py-1 text-sm ${badgeClass(
                    action === a
                  )}`}
                >
                  {a}
                </Link>
              ))}
            </div>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-3">
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
            <p className="text-sm text-zinc-400">Total tokens (today)</p>
            <p className="mt-1 text-3xl font-semibold">{formatNumber(data.today.tokens)}</p>
          </div>
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
            <p className="text-sm text-zinc-400">Total calls (today)</p>
            <p className="mt-1 text-3xl font-semibold">{formatNumber(data.today.calls)}</p>
          </div>
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
            <p className="text-sm text-zinc-400">Estimated cost (range)</p>
            <p className="mt-1 text-3xl font-semibold">${data.today.estimatedCostUsd}</p>
          </div>
        </section>

        <section className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
            <h2 className="text-lg font-semibold">Breakdown by role (today)</h2>
            <div className="mt-3 space-y-2">
              {Object.entries(data.today.byRole).map(([key, bucket]) => (
                <div
                  key={key}
                  className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 py-2"
                >
                  <span className="text-zinc-300">{key}</span>
                  <span className="text-sm text-zinc-400">
                    {formatNumber(bucket.tokens)} tokens · {formatNumber(bucket.calls)} calls
                  </span>
                </div>
              ))}
              {Object.keys(data.today.byRole).length === 0 && (
                <p className="text-sm text-zinc-500">No data for this filter.</p>
              )}
            </div>
          </div>

          <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
            <h2 className="text-lg font-semibold">Breakdown by action (today)</h2>
            <div className="mt-3 space-y-2">
              {Object.entries(data.today.byAction).map(([key, bucket]) => (
                <div
                  key={key}
                  className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 py-2"
                >
                  <span className="text-zinc-300">{key}</span>
                  <span className="text-sm text-zinc-400">
                    {formatNumber(bucket.tokens)} tokens · {formatNumber(bucket.calls)} calls
                  </span>
                </div>
              ))}
              {Object.keys(data.today.byAction).length === 0 && (
                <p className="text-sm text-zinc-500">No data for this filter.</p>
              )}
            </div>
          </div>
        </section>

        <section className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
          <h2 className="text-lg font-semibold">Last 7 days</h2>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[520px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-zinc-800 text-left text-zinc-400">
                  <th className="py-2">Date (UTC)</th>
                  <th className="py-2">Tokens</th>
                  <th className="py-2">Calls</th>
                </tr>
              </thead>
              <tbody>
                {data.last7Days.map((day) => (
                  <tr key={day.date} className="border-b border-zinc-900 text-zinc-300">
                    <td className="py-2">{day.date}</td>
                    <td className="py-2">{formatNumber(day.tokens)}</td>
                    <td className="py-2">{formatNumber(day.calls)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
          <h2 className="text-lg font-semibold">Top Tasks (today)</h2>
          <div className="mt-3 space-y-3">
            {data.topTasksToday.map((task) => (
              <details
                key={task.taskId}
                className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-3"
              >
                <summary className="cursor-pointer list-none">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-zinc-200">{task.taskId}</span>
                    <span className="text-sm text-zinc-400">
                      {formatNumber(task.tokens)} tokens · {formatNumber(task.calls)} calls
                    </span>
                  </div>
                </summary>
                <div className="mt-3 grid gap-3 md:grid-cols-3">
                  <div>
                    <p className="mb-1 text-xs uppercase tracking-wide text-zinc-500">Roles</p>
                    <div className="space-y-1">
                      {Object.entries(task.byRole).map(([key, bucket]) => (
                        <p key={key} className="text-sm text-zinc-300">
                          {key}: {formatNumber(bucket.tokens)} tokens
                        </p>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="mb-1 text-xs uppercase tracking-wide text-zinc-500">Actions</p>
                    <div className="space-y-1">
                      {Object.entries(task.byAction).map(([key, bucket]) => (
                        <p key={key} className="text-sm text-zinc-300">
                          {key}: {formatNumber(bucket.tokens)} tokens
                        </p>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="mb-1 text-xs uppercase tracking-wide text-zinc-500">Models</p>
                    <div className="space-y-1">
                      {Object.entries(task.byModel).map(([key, bucket]) => (
                        <p key={key} className="text-sm text-zinc-300">
                          {key}: {formatNumber(bucket.tokens)} tokens
                        </p>
                      ))}
                    </div>
                  </div>
                </div>
              </details>
            ))}
            {data.topTasksToday.length === 0 && (
              <p className="text-sm text-zinc-500">No task activity for today yet.</p>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
