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
      <section className="flex flex-col items-center gap-5 py-3">
        <div className="flex flex-col items-center gap-2 text-center">
          <h1 className="text-3xl font-black leading-tight sm:text-4xl">
            Attempt history
          </h1>
          <p className="max-w-2xl text-sm font-semibold leading-6 text-ink-muted">
            Review previous immersion drills, corrections, and recurring
            patterns.
          </p>
        </div>
        <HistorySearch actor={actor} />
      </section>
      <HistoryStats actor={actor} />
      {snapshot.matches("Loading") ? (
        <div className="rounded-md border border-line bg-panel p-8 text-center text-sm font-bold text-ink-muted">
          Loading attempts
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
      {snapshot.matches("Ready") ? <HistoryList actor={actor} /> : null}
    </div>
  );
}

function HistorySearch({ actor }: { readonly actor: PracticeHistoryActor }) {
  const query = useSelector(actor, (snapshot) => snapshot.context.query);

  return (
    <label className="relative w-full max-w-2xl">
      <Search
        aria-hidden="true"
        className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-ink-muted"
        size={18}
        strokeWidth={2.5}
      />
      <input
        autoComplete="off"
        className="h-12 w-full rounded-md border border-line bg-panel pl-11 pr-4 text-base font-bold outline-none transition placeholder:text-ink-muted/70 focus:border-ink"
        placeholder="Search sentence, answer, correction, reason, tag"
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

function HistoryStats({ actor }: { readonly actor: PracticeHistoryActor }) {
  const attempts = useSelector(actor, (snapshot) => snapshot.context.attempts);
  const matchingAttempts = useSelector(
    actor,
    (snapshot) => snapshot.context.matchingAttempts
  );
  const correctCount = attempts.filter(
    (view) => view.attempt.result === "correct"
  ).length;
  const usableCount = attempts.filter(
    (view) => view.attempt.result === "usable"
  ).length;
  const incorrectCount = attempts.filter(
    (view) => view.attempt.result === "incorrect"
  ).length;

  return (
    <section className="grid gap-3 sm:grid-cols-4">
      <div className="rounded-md border border-line bg-panel p-4">
        <div className="text-xs font-black uppercase text-ink-muted">Shown</div>
        <div className="mt-1 text-2xl font-black">
          {matchingAttempts.length}
        </div>
      </div>
      <div className="rounded-md border border-teal/20 bg-teal-soft p-4 text-teal">
        <div className="text-xs font-black uppercase">Correct</div>
        <div className="mt-1 text-2xl font-black">{correctCount}</div>
      </div>
      <div className="rounded-md border border-gold/20 bg-gold-soft p-4 text-gold">
        <div className="text-xs font-black uppercase">Usable</div>
        <div className="mt-1 text-2xl font-black">{usableCount}</div>
      </div>
      <div className="rounded-md border border-accent/20 bg-accent-soft p-4 text-accent">
        <div className="text-xs font-black uppercase">Incorrect</div>
        <div className="mt-1 text-2xl font-black">{incorrectCount}</div>
      </div>
    </section>
  );
}

function HistoryList({ actor }: { readonly actor: PracticeHistoryActor }) {
  const attempts = useSelector(
    actor,
    (snapshot) => snapshot.context.matchingAttempts
  );

  if (!EffectArray.isReadonlyArrayNonEmpty(attempts)) {
    return (
      <div className="rounded-md border border-line bg-panel p-10 text-center">
        <div className="text-lg font-black">No attempts found</div>
        <div className="mt-2 text-sm font-semibold text-ink-muted">
          Import a CSV or adjust the search text.
        </div>
      </div>
    );
  }

  return (
    <section className="overflow-hidden rounded-md border border-line bg-panel">
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
              className="grid gap-4 p-4 lg:grid-cols-[1fr_1fr_160px]"
            >
              <div className="min-w-0">
                <div className="text-xs font-black uppercase text-ink-muted">
                  Sentence
                </div>
                <p className="mt-1 text-base font-bold leading-6">
                  {view.attempt.sentence}
                </p>
                {view.attempt.patternTag === undefined ? null : (
                  <div className="mt-3 inline-flex rounded-md border border-line bg-field px-2 py-1 text-xs font-black text-ink-muted">
                    {view.attempt.patternTag}
                  </div>
                )}
              </div>
              <div className="min-w-0">
                <div className="text-xs font-black uppercase text-ink-muted">
                  Attempt
                </div>
                <p className="mt-1 text-base font-bold leading-6">
                  {view.attempt.response}
                </p>
                {view.attempt.correction === undefined ? null : (
                  <p className="mt-3 rounded-md bg-field p-3 text-sm font-semibold leading-6">
                    {view.attempt.correction}
                  </p>
                )}
                {view.attempt.reason === undefined ? null : (
                  <p className="mt-2 text-sm font-semibold leading-6 text-ink-muted">
                    {view.attempt.reason}
                  </p>
                )}
              </div>
              <div className="flex flex-row items-start justify-between gap-3 lg:flex-col lg:items-end">
                <span
                  className={`inline-flex rounded-md border px-2.5 py-1 text-xs font-black ${
                    view.attempt.result === "correct"
                      ? "border-teal/25 bg-teal-soft text-teal"
                      : view.attempt.result === "usable"
                        ? "border-gold/25 bg-gold-soft text-gold"
                        : "border-accent/25 bg-accent-soft text-accent"
                  }`}
                >
                  {resultLabel}
                </span>
                <div className="text-right text-xs font-bold leading-5 text-ink-muted">
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
