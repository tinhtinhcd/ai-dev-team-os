import { auth, signIn, signOut } from "@/auth";

export default async function Home() {
  const session = await auth();

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-950 text-zinc-100">
      <main className="flex flex-col items-center gap-8 text-center">
        <h1 className="text-3xl font-semibold tracking-tight">
          AI Dev Team OS · Gateway
        </h1>
        <p className="max-w-md text-zinc-400">
          Event-driven gateway for Linear, Cursor, and Slack. Central hub for
          status updates and task coordination.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-4">
          {session?.user ? (
            <>
              <span className="text-zinc-400">
                Signed in as {session.user.email ?? session.user.name}
              </span>
              <form
                action={async () => {
                  "use server";
                  await signOut();
                }}
              >
                <button
                  type="submit"
                  className="rounded-lg border border-zinc-600 px-6 py-3 font-medium text-zinc-300 hover:bg-zinc-800 transition-colors"
                >
                  Sign out
                </button>
              </form>
            </>
          ) : (
            <form
              action={async () => {
                "use server";
                await signIn("google");
              }}
            >
              <button
                type="submit"
                className="rounded-lg bg-violet-600 px-6 py-3 font-medium text-white hover:bg-violet-500 transition-colors"
              >
                Sign in with Google
              </button>
            </form>
          )}
          <a
            href="/api/gateway/health"
            className="rounded-lg bg-violet-600 px-6 py-3 font-medium text-white hover:bg-violet-500 transition-colors"
          >
            Health Check
          </a>
        </div>
      </main>
    </div>
  );
}
