import { PracticeOverviewMachine } from "@jip/machines";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMachine } from "@xstate/react";
import { Array as EffectArray } from "effect";
import { RefreshCw } from "lucide-react";

import { formatDateTime } from "../lib/format.ts";
import { RuntimeClient } from "../lib/runtime-client.ts";

const practiceOverviewMachine =
  PracticeOverviewMachine.makePracticeOverviewMachine({
    runtime: RuntimeClient,
  });

export const Route = createFileRoute("/practice")({
  component: PracticeRoute,
});

function PracticeRoute() {
  const [snapshot, , actor] = useMachine(practiceOverviewMachine);

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <section className="flex flex-col gap-2">
        <h1 className="text-3xl font-black leading-tight">Practice</h1>
        <p className="text-sm font-semibold leading-6 text-ink-muted">
          Word practice is ready for the next state-modeling pass.
        </p>
      </section>
      <section className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-md border border-line bg-panel p-4">
          <div className="text-xs font-black uppercase text-ink-muted">
            Words
          </div>
          <div className="mt-1 text-2xl font-black">
            {snapshot.context.words.length}
          </div>
        </div>
        <div className="rounded-md border border-gold/20 bg-gold-soft p-4 text-gold">
          <div className="text-xs font-black uppercase">Due</div>
          <div className="mt-1 text-2xl font-black">
            {snapshot.context.dueSubmissions.length}
          </div>
        </div>
        <div className="rounded-md border border-teal/20 bg-teal-soft p-4 text-teal">
          <div className="text-xs font-black uppercase">Submissions</div>
          <div className="mt-1 text-2xl font-black">
            {snapshot.context.submissions.length}
          </div>
        </div>
      </section>
      {snapshot.matches("Loading") ? (
        <div className="rounded-md border border-line bg-panel p-8 text-center text-sm font-bold text-ink-muted">
          Loading practice data
        </div>
      ) : null}
      {snapshot.matches("Failure") ? (
        <div className="flex items-center justify-between gap-4 rounded-md border border-accent/25 bg-accent-soft p-4 text-sm font-bold text-accent">
          <span>{snapshot.context.message}</span>
          <button
            type="button"
            className="inline-flex h-9 items-center gap-2 rounded-md border border-accent/30 bg-panel px-3 text-sm font-black"
            onClick={() => {
              actor.trigger.refresh();
            }}
          >
            <RefreshCw size={15} strokeWidth={2.5} />
            Retry
          </button>
        </div>
      ) : null}
      {snapshot.matches("Ready") ? (
        <section className="rounded-md border border-line bg-panel p-5">
          {!EffectArray.isReadonlyArrayNonEmpty(snapshot.context.words) ? (
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="text-lg font-black">No words yet</div>
                <div className="mt-1 text-sm font-semibold text-ink-muted">
                  Add a few entries to shape the first practice session.
                </div>
              </div>
              <Link
                to="/library"
                className="inline-flex h-10 items-center justify-center rounded-md border border-accent bg-accent px-4 text-sm font-black text-panel"
              >
                Add words
              </Link>
            </div>
          ) : (
            <div className="grid gap-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="text-lg font-black">Practice queue</div>
                  <div className="mt-1 text-sm font-semibold text-ink-muted">
                    Session controls will attach here after the review model is
                    finalized.
                  </div>
                </div>
                <button
                  type="button"
                  className="inline-flex h-10 items-center gap-2 rounded-md border border-line bg-panel px-4 text-sm font-black text-ink-muted transition hover:border-ink hover:text-ink"
                  onClick={() => {
                    actor.trigger.refresh();
                  }}
                >
                  <RefreshCw size={15} strokeWidth={2.5} />
                  Refresh
                </button>
              </div>
              <div className="divide-y divide-line rounded-md border border-line">
                {snapshot.context.words.slice(0, 8).map((word) => (
                  <article
                    key={word.text}
                    className="grid gap-2 p-4 sm:grid-cols-[1fr_160px]"
                  >
                    <div>
                      <div className="text-lg font-black">{word.text}</div>
                      <div className="text-sm font-black text-accent">
                        {word.translation}
                      </div>
                    </div>
                    <div className="text-left text-xs font-bold leading-5 text-ink-muted sm:text-right">
                      {formatDateTime({ dateTime: word.updatedAt })}
                    </div>
                  </article>
                ))}
              </div>
            </div>
          )}
        </section>
      ) : null}
    </div>
  );
}
