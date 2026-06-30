import { Link, Outlet, createRootRoute } from "@tanstack/react-router";
import { Dumbbell, History, Languages, Upload, WholeWord } from "lucide-react";

export const Route = createRootRoute({
  component: RootRoute,
});

function RootRoute() {
  return (
    <div className="min-h-svh overflow-x-hidden bg-paper text-ink">
      <nav
        aria-label="Primary"
        className="fixed bottom-[max(1rem,env(safe-area-inset-bottom))] left-1/2 z-30 flex -translate-x-1/2 gap-1 rounded-md border border-line bg-panel/95 p-1 shadow-[0_18px_50px_rgba(0,0,0,0.35)] backdrop-blur"
      >
        <Link
          to="/"
          aria-label="History"
          title="History"
          activeProps={{
            className:
              "!bg-action !text-action-ink hover:!bg-action-hover hover:!text-action-ink",
          }}
          className="inline-flex h-10 w-10 items-center justify-center rounded-md text-ink-muted transition hover:bg-field hover:text-ink"
        >
          <History size={18} strokeWidth={2.5} />
        </Link>
        <Link
          to="/import"
          aria-label="Import"
          title="Import"
          activeProps={{
            className:
              "!bg-action !text-action-ink hover:!bg-action-hover hover:!text-action-ink",
          }}
          className="inline-flex h-10 w-10 items-center justify-center rounded-md text-ink-muted transition hover:bg-field hover:text-ink"
        >
          <Upload size={18} strokeWidth={2.5} />
        </Link>
        <Link
          to="/word"
          aria-label="Word"
          title="Word"
          activeProps={{
            className:
              "!bg-action !text-action-ink hover:!bg-action-hover hover:!text-action-ink",
          }}
          className="inline-flex h-10 w-10 items-center justify-center rounded-md text-ink-muted transition hover:bg-field hover:text-ink"
        >
          <WholeWord size={18} strokeWidth={2.5} />
        </Link>
        <Link
          to="/kanji"
          aria-label="Kanji"
          title="Kanji"
          activeProps={{
            className:
              "!bg-action !text-action-ink hover:!bg-action-hover hover:!text-action-ink",
          }}
          className="inline-flex h-10 w-10 items-center justify-center rounded-md text-ink-muted transition hover:bg-field hover:text-ink"
        >
          <Languages size={18} strokeWidth={2.5} />
        </Link>
        <Link
          to="/practice"
          aria-label="Practice"
          title="Practice"
          activeProps={{
            className:
              "!bg-action !text-action-ink hover:!bg-action-hover hover:!text-action-ink",
          }}
          className="inline-flex h-10 w-10 items-center justify-center rounded-md text-ink-muted transition hover:bg-field hover:text-ink"
        >
          <Dumbbell size={18} strokeWidth={2.5} />
        </Link>
      </nav>
      <main className="mx-auto min-h-svh w-full max-w-3xl px-4 pb-[calc(7rem+env(safe-area-inset-bottom))] pt-6 sm:px-6 sm:pt-10">
        <Outlet />
      </main>
    </div>
  );
}
