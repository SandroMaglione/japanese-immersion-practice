import { Link, Outlet, createRootRoute } from "@tanstack/react-router";
import { BookOpenText, Dumbbell, History, Upload } from "lucide-react";

export const Route = createRootRoute({
  component: RootRoute,
});

function RootRoute() {
  return (
    <div className="min-h-screen bg-paper text-ink">
      <header className="border-b border-line bg-panel/85 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-4 sm:px-6 lg:flex-row lg:items-center lg:justify-between">
          <Link to="/" className="w-fit">
            <div className="text-sm font-black uppercase text-accent">
              Japanese Immersion Practice
            </div>
          </Link>
          <nav className="flex flex-wrap items-center gap-2">
            <Link
              to="/"
              activeProps={{
                className: "border-ink bg-ink text-panel",
              }}
              className="inline-flex h-10 items-center gap-2 rounded-md border border-line bg-panel px-3 text-sm font-bold text-ink-muted transition hover:border-ink hover:text-ink"
            >
              <History size={16} strokeWidth={2.5} />
              History
            </Link>
            <Link
              to="/import"
              activeProps={{
                className: "border-ink bg-ink text-panel",
              }}
              className="inline-flex h-10 items-center gap-2 rounded-md border border-line bg-panel px-3 text-sm font-bold text-ink-muted transition hover:border-ink hover:text-ink"
            >
              <Upload size={16} strokeWidth={2.5} />
              Import
            </Link>
            <Link
              to="/library"
              activeProps={{
                className: "border-ink bg-ink text-panel",
              }}
              className="inline-flex h-10 items-center gap-2 rounded-md border border-line bg-panel px-3 text-sm font-bold text-ink-muted transition hover:border-ink hover:text-ink"
            >
              <BookOpenText size={16} strokeWidth={2.5} />
              Library
            </Link>
            <Link
              to="/practice"
              activeProps={{
                className: "border-ink bg-ink text-panel",
              }}
              className="inline-flex h-10 items-center gap-2 rounded-md border border-line bg-panel px-3 text-sm font-bold text-ink-muted transition hover:border-ink hover:text-ink"
            >
              <Dumbbell size={16} strokeWidth={2.5} />
              Practice
            </Link>
          </nav>
        </div>
      </header>
      <main className="mx-auto min-h-[calc(100vh-73px)] max-w-6xl px-4 py-8 sm:px-6">
        <Outlet />
      </main>
    </div>
  );
}
