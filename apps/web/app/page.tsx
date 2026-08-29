export default function Home() {
  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <div className="flex min-h-screen">
        {/* Sidebar */}
        <aside className="hidden w-64 border-r border-slate-800 bg-slate-900 md:flex md:flex-col">
          <div className="border-b border-slate-800 px-6 py-5">
            <div className="text-xl font-bold tracking-tight">
              Social<span className="text-blue-400">Ops</span>
            </div>
            <p className="mt-1 text-xs text-slate-500">
              Social media operations
            </p>
          </div>

          <nav className="flex-1 px-3 py-5">
            <p className="px-3 pb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">
              Workspace
            </p>

            <a
              href="#"
              className="mb-1 flex items-center rounded-lg bg-blue-500/10 px-3 py-2.5 text-sm font-medium text-blue-400"
            >
              <span className="mr-3">▦</span>
              Dashboard
            </a>

            <a
              href="#"
              className="mb-1 flex items-center rounded-lg px-3 py-2.5 text-sm text-slate-400 hover:bg-slate-800 hover:text-white"
            >
              <span className="mr-3">◫</span>
              Content
            </a>

            <a
              href="#"
              className="mb-1 flex items-center rounded-lg px-3 py-2.5 text-sm text-slate-400 hover:bg-slate-800 hover:text-white"
            >
              <span className="mr-3">◷</span>
              Publishing
            </a>

            <a
              href="#"
              className="mb-1 flex items-center rounded-lg px-3 py-2.5 text-sm text-slate-400 hover:bg-slate-800 hover:text-white"
            >
              <span className="mr-3">◉</span>
              Analytics
            </a>

            <p className="px-3 pb-3 pt-8 text-xs font-semibold uppercase tracking-wider text-slate-500">
              Management
            </p>

            <a
              href="#"
              className="mb-1 flex items-center rounded-lg px-3 py-2.5 text-sm text-slate-400 hover:bg-slate-800 hover:text-white"
            >
              <span className="mr-3">◎</span>
              Accounts
            </a>

            <a
              href="#"
              className="mb-1 flex items-center rounded-lg px-3 py-2.5 text-sm text-slate-400 hover:bg-slate-800 hover:text-white"
            >
              <span className="mr-3">⚙</span>
              Settings
            </a>
          </nav>

          <div className="border-t border-slate-800 p-4">
            <div className="rounded-lg bg-slate-800/60 p-3">
              <p className="text-xs font-medium text-slate-300">
                SocialOps V1
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Workspace ready
              </p>
            </div>
          </div>
        </aside>

        {/* Main Area */}
        <section className="flex min-w-0 flex-1 flex-col">
          {/* Header */}
          <header className="flex h-16 items-center justify-between border-b border-slate-800 bg-slate-900/70 px-6">
            <div>
              <h1 className="text-lg font-semibold">Dashboard</h1>
            </div>

            <div className="flex items-center gap-4">
              <button
                type="button"
                className="rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-300 hover:bg-slate-800"
              >
                Notifications
              </button>

              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-500 text-sm font-semibold">
                SO
              </div>
            </div>
          </header>

          {/* Dashboard */}
          <div className="flex-1 overflow-auto p-6 md:p-8">
            <div className="mx-auto max-w-7xl">
              {/* Welcome */}
              <div className="mb-8">
                <p className="text-sm text-slate-500">Overview</p>
                <h2 className="mt-1 text-3xl font-bold tracking-tight">
                  Welcome to SocialOps
                </h2>
                <p className="mt-2 max-w-2xl text-sm text-slate-400">
                  Manage your social media operations from one workspace.
                </p>
              </div>

              {/* Stats */}
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-xl border border-slate-800 bg-slate-900 p-5">
                  <p className="text-sm text-slate-500">Connected Accounts</p>
                  <p className="mt-3 text-3xl font-semibold">0</p>
                  <p className="mt-1 text-xs text-slate-500">
                    No accounts connected
                  </p>
                </div>

                <div className="rounded-xl border border-slate-800 bg-slate-900 p-5">
                  <p className="text-sm text-slate-500">Scheduled Posts</p>
                  <p className="mt-3 text-3xl font-semibold">0</p>
                  <p className="mt-1 text-xs text-slate-500">
                    Nothing scheduled
                  </p>
                </div>

                <div className="rounded-xl border border-slate-800 bg-slate-900 p-5">
                  <p className="text-sm text-slate-500">Published</p>
                  <p className="mt-3 text-3xl font-semibold">0</p>
                  <p className="mt-1 text-xs text-slate-500">
                    No published content
                  </p>
                </div>

                <div className="rounded-xl border border-slate-800 bg-slate-900 p-5">
                  <p className="text-sm text-slate-500">Engagement</p>
                  <p className="mt-3 text-3xl font-semibold">0</p>
                  <p className="mt-1 text-xs text-slate-500">
                    No data available
                  </p>
                </div>
              </div>

              {/* Main Cards */}
              <div className="mt-6 grid gap-6 lg:grid-cols-3">
                <div className="rounded-xl border border-slate-800 bg-slate-900 p-6 lg:col-span-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-semibold">Recent Activity</h3>
                      <p className="mt-1 text-sm text-slate-500">
                        Your latest SocialOps activity will appear here.
                      </p>
                    </div>
                  </div>

                  <div className="mt-8 flex min-h-48 items-center justify-center rounded-lg border border-dashed border-slate-800">
                    <div className="text-center">
                      <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-slate-800 text-slate-500">
                        —
                      </div>
                      <p className="text-sm text-slate-400">
                        No activity yet
                      </p>
                      <p className="mt-1 text-xs text-slate-600">
                        Activity will appear as you use SocialOps.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="rounded-xl border border-slate-800 bg-slate-900 p-6">
                  <h3 className="font-semibold">Quick Actions</h3>
                  <p className="mt-1 text-sm text-slate-500">
                    Common workspace actions
                  </p>

                  <div className="mt-6 space-y-3">
                    <button
                      type="button"
                      className="w-full rounded-lg bg-blue-600 px-4 py-3 text-left text-sm font-medium hover:bg-blue-500"
                    >
                      + Create Content
                    </button>

                    <button
                      type="button"
                      className="w-full rounded-lg border border-slate-700 px-4 py-3 text-left text-sm font-medium text-slate-300 hover:bg-slate-800"
                    >
                      + Connect Account
                    </button>

                    <button
                      type="button"
                      className="w-full rounded-lg border border-slate-700 px-4 py-3 text-left text-sm font-medium text-slate-300 hover:bg-slate-800"
                    >
                      View Analytics
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}