import { Link, Outlet, createRootRoute } from "@tanstack/react-router";
import { Tooltip } from "@base-ui/react/tooltip";
import { Brain, Dumbbell, ListChecks, WholeWord } from "lucide-react";

export const Route = createRootRoute({
  component: RootRoute,
});

function RootRoute() {
  return (
    <Tooltip.Provider delay={450} closeDelay={80}>
      <div className="isolate min-h-svh overflow-x-hidden bg-paper text-ink">
        <nav
          aria-label="Primary"
          className="fixed bottom-[max(1rem,env(safe-area-inset-bottom))] left-1/2 z-30 flex -translate-x-1/2 gap-1 rounded-md border border-line bg-panel/95 p-1 shadow-[0_18px_50px_rgba(0,0,0,0.35)] backdrop-blur"
        >
          <Tooltip.Root>
            <Tooltip.Trigger
              render={
                <Link
                  to="/word"
                  aria-label="Word"
                  activeProps={{
                    className:
                      "!bg-action !text-action-ink hover:!bg-action-hover hover:!text-action-ink",
                  }}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-md text-ink-muted transition hover:bg-field hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky"
                />
              }
            >
              <WholeWord size={18} strokeWidth={2.5} />
            </Tooltip.Trigger>
            <Tooltip.Portal>
              <Tooltip.Positioner sideOffset={8}>
                <Tooltip.Popup className="rounded-md border border-line bg-panel px-2 py-1 text-xs font-black text-ink shadow-[0_12px_35px_rgba(0,0,0,0.35)]">
                  Word
                </Tooltip.Popup>
              </Tooltip.Positioner>
            </Tooltip.Portal>
          </Tooltip.Root>
          <Tooltip.Root>
            <Tooltip.Trigger
              render={
                <Link
                  to="/levels"
                  aria-label="Word memory"
                  activeProps={{
                    className:
                      "!bg-action !text-action-ink hover:!bg-action-hover hover:!text-action-ink",
                  }}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-md text-ink-muted transition hover:bg-field hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky"
                />
              }
            >
              <Brain size={18} strokeWidth={2.5} />
            </Tooltip.Trigger>
            <Tooltip.Portal>
              <Tooltip.Positioner sideOffset={8}>
                <Tooltip.Popup className="rounded-md border border-line bg-panel px-2 py-1 text-xs font-black text-ink shadow-[0_12px_35px_rgba(0,0,0,0.35)]">
                  Word memory
                </Tooltip.Popup>
              </Tooltip.Positioner>
            </Tooltip.Portal>
          </Tooltip.Root>
          <Tooltip.Root>
            <Tooltip.Trigger
              render={
                <Link
                  to="/"
                  aria-label="Word history"
                  activeProps={{
                    className:
                      "!bg-action !text-action-ink hover:!bg-action-hover hover:!text-action-ink",
                  }}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-md text-ink-muted transition hover:bg-field hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky"
                />
              }
            >
              <ListChecks size={18} strokeWidth={2.5} />
            </Tooltip.Trigger>
            <Tooltip.Portal>
              <Tooltip.Positioner sideOffset={8}>
                <Tooltip.Popup className="rounded-md border border-line bg-panel px-2 py-1 text-xs font-black text-ink shadow-[0_12px_35px_rgba(0,0,0,0.35)]">
                  Word history
                </Tooltip.Popup>
              </Tooltip.Positioner>
            </Tooltip.Portal>
          </Tooltip.Root>
          <Tooltip.Root>
            <Tooltip.Trigger
              render={
                <Link
                  to="/practice"
                  aria-label="Practice"
                  activeProps={{
                    className:
                      "!bg-action !text-action-ink hover:!bg-action-hover hover:!text-action-ink",
                  }}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-md text-ink-muted transition hover:bg-field hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky"
                />
              }
            >
              <Dumbbell size={18} strokeWidth={2.5} />
            </Tooltip.Trigger>
            <Tooltip.Portal>
              <Tooltip.Positioner sideOffset={8}>
                <Tooltip.Popup className="rounded-md border border-line bg-panel px-2 py-1 text-xs font-black text-ink shadow-[0_12px_35px_rgba(0,0,0,0.35)]">
                  Practice
                </Tooltip.Popup>
              </Tooltip.Positioner>
            </Tooltip.Portal>
          </Tooltip.Root>
        </nav>
        <main className="mx-auto min-h-svh w-full max-w-3xl px-4 pb-[calc(7rem+env(safe-area-inset-bottom))] pt-6 sm:px-6 sm:pt-10">
          <Outlet />
        </main>
      </div>
    </Tooltip.Provider>
  );
}
