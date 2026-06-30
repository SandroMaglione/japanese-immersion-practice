import { PracticeHistoryMachine } from "@jip/machines";
import { createFileRoute } from "@tanstack/react-router";
import { useMachine, useSelector } from "@xstate/react";
import { Array as EffectArray } from "effect";
import { RefreshCw, Search } from "lucide-react";
import type { Actor } from "xstate";

import { formatDateTime } from "../lib/format.ts";
import { RuntimeClient } from "../lib/runtime-client.ts";

const historyMachine = PracticeHistoryMachine.makePracticeHistoryMachine({
  runtime: RuntimeClient,
});

type PracticeHistoryActor = Actor<typeof historyMachine>;

export const Route = createFileRoute("/")({
  component: HistoryRoute,
});

function HistoryRoute() {
  const [snapshot, , actor] = useMachine(historyMachine);

  return (
    <div className="flex flex-col gap-6">
      <section className="flex justify-center">
        <HistorySearch actor={actor} />
      </section>
      {snapshot.matches("Loading") ? (
        <div className="py-10 text-center text-sm font-bold text-ink-muted">
          Loading attempts
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
      {snapshot.matches("Ready") ? <HistoryList actor={actor} /> : null}
    </div>
  );
}

function HistorySearch({ actor }: { readonly actor: PracticeHistoryActor }) {
  const query = useSelector(actor, (snapshot) => snapshot.context.query);

  return (
    <label className="relative w-full max-w-xl">
      <Search
        aria-hidden="true"
        className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-ink-muted"
        size={18}
        strokeWidth={2.5}
      />
      <input
        autoComplete="off"
        className="h-12 w-full rounded-md border border-line bg-field pl-11 pr-4 text-base font-bold outline-none transition placeholder:text-ink-muted/70 focus:border-ink-muted"
        placeholder="Search attempts"
        type="search"
        value={query}
        onChange={(event) => {
          actor.trigger.changeQuery({
            query: event.currentTarget.value,
          });
        }}
      />
    </label>
  );
}

function HistoryList({ actor }: { readonly actor: PracticeHistoryActor }) {
  const attempts = useSelector(
    actor,
    (snapshot) => snapshot.context.matchingAttempts
  );

  if (!EffectArray.isReadonlyArrayNonEmpty(attempts)) {
    return (
      <div className="py-14 text-center">
        <div className="text-lg font-black">No attempts found</div>
        <div className="mt-2 text-sm font-semibold text-ink-muted">
          Import JSON or adjust the search text.
        </div>
      </div>
    );
  }

  return (
    <section>
      <div className="divide-y divide-line">
        {attempts.map((view) => {
          const resultLabel =
            view.attempt.result === "correct"
              ? "Correct"
              : view.attempt.result === "usable"
                ? "Usable"
                : "Incorrect";

          return (
            <article
              key={view.attempt.id}
              className="grid gap-3 py-3 sm:grid-cols-[1fr_auto]"
            >
              <div className="min-w-0">
                <p className="text-base font-bold leading-6">
                  {view.attempt.sentence}
                </p>
                <p className="mt-2 text-sm font-semibold leading-6 text-ink-muted">
                  {view.attempt.response}
                </p>
              </div>
              <div className="flex items-start justify-between gap-4 text-xs font-bold leading-5 text-ink-muted sm:flex-col sm:items-end">
                <span
                  className={`font-black ${
                    view.attempt.result === "correct"
                      ? "text-teal"
                      : view.attempt.result === "usable"
                        ? "text-gold"
                        : "text-accent"
                  }`}
                >
                  {resultLabel}
                </span>
                <div className="text-left sm:text-right">
                  <div>{view.practiceImport.sourceFileName}</div>
                  <div>
                    {formatDateTime({
                      dateTime: view.practiceImport.importedAt,
                    })}
                  </div>
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
