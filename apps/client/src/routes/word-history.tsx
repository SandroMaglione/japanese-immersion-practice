import { Button } from "@base-ui/react/button";
import { Input } from "@base-ui/react/input";
import { WordPracticeHistoryMachine } from "@jip/machines";
import { createFileRoute } from "@tanstack/react-router";
import { useMachine, useSelector } from "@xstate/react";
import { Array as EffectArray } from "effect";
import { CircleCheck, CircleX, RefreshCw, Search } from "lucide-react";
import type { Actor } from "xstate";

import { KanjiWordText } from "../components/kanji-word-text.tsx";
import { formatDateTime } from "../lib/format.ts";
import { RuntimeClient } from "../lib/runtime-client.ts";

const wordPracticeHistoryMachine =
  WordPracticeHistoryMachine.makeWordPracticeHistoryMachine({
    runtime: RuntimeClient,
  });

const VisibleAttemptLimit = 3;

type WordPracticeHistoryActor = Actor<typeof wordPracticeHistoryMachine>;

export const Route = createFileRoute("/word-history")({
  component: WordHistoryRoute,
});

function WordHistoryRoute() {
  const [snapshot, , actor] = useMachine(wordPracticeHistoryMachine);

  return (
    <div className="flex flex-col gap-6">
      <section className="flex justify-center">
        <WordHistorySearch actor={actor} />
      </section>
      {snapshot.matches("Loading") ? (
        <div className="py-10 text-center text-sm font-bold text-ink-muted">
          Loading word history
        </div>
      ) : null}
      {snapshot.matches("Failure") ? (
        <div className="flex items-center justify-between gap-4 py-4 text-sm font-bold text-accent">
          <span>{snapshot.context.message}</span>
          <Button
            type="button"
            className="inline-flex h-9 items-center gap-2 rounded-md px-3 text-sm font-black transition hover:bg-field focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky"
            onClick={() => {
              actor.trigger.refresh();
            }}
          >
            <RefreshCw size={15} strokeWidth={2.5} />
            Retry
          </Button>
        </div>
      ) : null}
      {snapshot.matches("Ready") ? <WordHistoryList actor={actor} /> : null}
    </div>
  );
}

function WordHistorySearch({
  actor,
}: {
  readonly actor: WordPracticeHistoryActor;
}) {
  const query = useSelector(actor, (snapshot) => snapshot.context.query);

  return (
    <label className="relative w-full max-w-xl">
      <Search
        aria-hidden="true"
        className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-ink-muted"
        size={18}
        strokeWidth={2.5}
      />
      <Input
        aria-label="Search word attempts"
        autoComplete="off"
        className="h-12 w-full rounded-md border border-line bg-field pl-11 pr-4 text-base font-bold outline-none transition placeholder:text-ink-muted/70 focus:border-ink-muted"
        placeholder="Search word attempts"
        type="search"
        value={query}
        onValueChange={(query) => {
          actor.trigger.changeQuery({
            query,
          });
        }}
      />
    </label>
  );
}

function WordHistoryList({
  actor,
}: {
  readonly actor: WordPracticeHistoryActor;
}) {
  const summaries = useSelector(
    actor,
    (snapshot) => snapshot.context.matchingSummaries
  );

  if (!EffectArray.isReadonlyArrayNonEmpty(summaries)) {
    return (
      <div className="py-14 text-center">
        <div className="text-lg font-black">No word attempts found</div>
        <div className="mt-2 text-sm font-semibold text-ink-muted">
          Practice words or adjust the search text.
        </div>
      </div>
    );
  }

  return (
    <section className="divide-y divide-line">
      {summaries.map((summary) => {
        const streakLabel =
          summary.correctStreak > 0
            ? `${summary.correctStreak} correct`
            : `${summary.incorrectStreak} missed`;
        const visibleAttempts = summary.attempts.slice(0, VisibleAttemptLimit);
        const hiddenAttemptCount =
          summary.attempts.length - visibleAttempts.length;
        const hiddenAttemptLabel =
          hiddenAttemptCount === 1
            ? "1 older attempt"
            : `${hiddenAttemptCount} older attempts`;

        return (
          <article key={summary.word.text} className="grid gap-5 px-3 py-8">
            <header className="grid gap-3">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <h2 className="wrap-break-word text-3xl font-black leading-tight">
                    <KanjiWordText kanjiEntries={[]} text={summary.word.text} />
                  </h2>
                  <p className="mt-1 wrap-break-word text-sm font-bold leading-6 text-ink-muted">
                    {summary.word.translation}
                  </p>
                </div>
                <div className="shrink-0 text-left text-xs font-black text-ink-muted sm:text-right">
                  {formatDateTime({ dateTime: summary.lastSubmittedAt })}
                </div>
              </div>
              {summary.word.description === undefined ? null : (
                <p className="wrap-break-word text-sm font-semibold leading-6 text-ink-muted">
                  {summary.word.description}
                </p>
              )}
              <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <WordHistoryStat
                  label="Accuracy"
                  value={`${summary.accuracy}%`}
                />
                <WordHistoryStat
                  label="Attempts"
                  value={`${summary.attemptCount}`}
                />
                <WordHistoryStat
                  label="Correct"
                  value={`${summary.correctCount}`}
                />
                <WordHistoryStat label="Streak" value={streakLabel} />
              </dl>
            </header>
            <div className="divide-y divide-line">
              {visibleAttempts.map((attempt) => {
                const isCorrect = attempt.result === "correct";
                const ResultIcon = isCorrect ? CircleCheck : CircleX;
                const resultColor = isCorrect ? "text-teal" : "text-accent";
                const batchLabel =
                  attempt.batch === undefined
                    ? "Legacy"
                    : `Batch ${attempt.batch.batchNumber}`;

                return (
                  <div
                    key={attempt.submission.id}
                    className="grid grid-cols-[auto_minmax(0,1fr)] gap-3 py-4"
                  >
                    <ResultIcon
                      aria-label={isCorrect ? "Correct" : "Incorrect"}
                      className={`mt-1 ${resultColor}`}
                      role="img"
                      size={20}
                      strokeWidth={2.5}
                    />
                    <div className="min-w-0">
                      <p className="wrap-break-word whitespace-pre-wrap text-base font-black leading-7">
                        {attempt.submission.submittedText.trim() === ""
                          ? "Blank answer"
                          : attempt.submission.submittedText}
                      </p>
                      <p className="mt-1 text-xs font-bold text-ink-muted">
                        {batchLabel} ·{" "}
                        {formatDateTime({
                          dateTime: attempt.submission.submittedAt,
                        })}
                      </p>
                    </div>
                  </div>
                );
              })}
              {hiddenAttemptCount > 0 ? (
                <div className="py-3 text-xs font-black uppercase text-ink-muted">
                  {hiddenAttemptLabel}
                </div>
              ) : null}
            </div>
          </article>
        );
      })}
    </section>
  );
}

function WordHistoryStat({
  label,
  value,
}: {
  readonly label: string;
  readonly value: string;
}) {
  return (
    <div className="rounded-md border border-line bg-panel px-3 py-2">
      <dt className="text-[0.7rem] font-black uppercase text-ink-muted">
        {label}
      </dt>
      <dd className="mt-1 wrap-break-word text-sm font-black text-ink">
        {value}
      </dd>
    </div>
  );
}
