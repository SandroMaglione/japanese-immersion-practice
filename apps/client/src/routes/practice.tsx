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
    <div className="flex flex-col gap-6">
      {snapshot.matches("Loading") ? (
        <div className="py-10 text-center text-sm font-bold text-ink-muted">
          Loading practice data
        </div>
      ) : null}
      {snapshot.matches("Failure") ? (
        <div className="flex items-center justify-between gap-4 py-4 text-sm font-bold text-accent">
          <span>{snapshot.context.message}</span>
          <button
            type="button"
            className="inline-flex h-9 items-center gap-2 rounded-md px-3 text-sm font-black transition hover:bg-field"
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
        <section>
          {!EffectArray.isReadonlyArrayNonEmpty(snapshot.context.words) ? (
            <div className="flex flex-col gap-4 py-6 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="text-lg font-black">No words yet</div>
                <div className="mt-1 text-sm font-semibold text-ink-muted">
                  Add a few entries to shape the first practice session.
                </div>
              </div>
              <Link
                to="/word"
                className="inline-flex h-10 items-center justify-center rounded-md bg-action px-4 text-sm font-black text-action-ink transition hover:bg-action-hover"
              >
                Add words
              </Link>
            </div>
          ) : (
            <div className="grid gap-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="text-lg font-black">Practice queue</div>
                </div>
                <button
                  type="button"
                  className="inline-flex h-10 w-fit items-center gap-2 rounded-md px-3 text-sm font-black text-ink-muted transition hover:bg-field hover:text-ink"
                  onClick={() => {
                    actor.trigger.refresh();
                  }}
                >
                  <RefreshCw size={15} strokeWidth={2.5} />
                  Refresh
                </button>
              </div>
              <div className="divide-y divide-line">
                {snapshot.context.words.slice(0, 8).map((word) => (
                  <article
                    key={word.text}
                    className="grid gap-2 py-4 sm:grid-cols-[1fr_160px]"
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
