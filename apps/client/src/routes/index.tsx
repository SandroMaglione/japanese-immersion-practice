import { Button } from "@base-ui/react/button";
import { Dialog } from "@base-ui/react/dialog";
import { Input } from "@base-ui/react/input";
import { WordPracticeHistoryMachine } from "@jip/machines";
import { createFileRoute } from "@tanstack/react-router";
import { useMachine, useSelector } from "@xstate/react";
import { Array as EffectArray } from "effect";
import { CircleCheck, CircleX, RefreshCw, Search, X } from "lucide-react";
import type { ReactNode } from "react";
import type { Actor } from "xstate";

import { WordText } from "../components/word-text.tsx";
import { formatDateTime } from "../lib/format.ts";
import { RuntimeClient } from "../lib/runtime-client.ts";

const wordPracticeHistoryMachine =
  WordPracticeHistoryMachine.makeWordPracticeHistoryMachine({
    runtime: RuntimeClient,
  });

const VisibleAttemptLimit = 8;

const dialogBackdropClassName = "fixed inset-0 bg-paper/70 backdrop-blur-sm";

const dialogPopupClassName =
  "fixed left-1/2 top-1/2 grid h-[min(calc(100svh-1rem),44rem)] w-[min(calc(100vw-1rem),44rem)] -translate-x-1/2 -translate-y-1/2 grid-rows-[auto_minmax(0,1fr)] gap-4 overflow-hidden rounded-md border border-line bg-panel p-4 text-ink shadow-[0_24px_80px_rgba(0,0,0,0.45)] focus:outline-none sm:h-[min(calc(100svh-2rem),44rem)] sm:w-[min(calc(100vw-2rem),44rem)] sm:gap-5 sm:p-5";

const dialogIconButtonClassName =
  "inline-flex size-9 shrink-0 items-center justify-center rounded-md border border-line bg-panel text-ink-muted transition hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky";

type WordPracticeHistoryActor = Actor<typeof wordPracticeHistoryMachine>;
type WordHistorySummary = ReturnType<
  WordPracticeHistoryActor["getSnapshot"]
>["context"]["summaries"][number];
type WordHistoryAttempt = WordHistorySummary["attempts"][number];
type SelectionPriority = {
  readonly className: string;
  readonly label: "Low" | "Mid" | "High" | "Top";
};
type SelectionPriorityScale = {
  readonly maxWeight: number;
  readonly minWeight: number;
};

const SelectionPriorities = [
  {
    className: "text-ink-muted",
    label: "Low",
  },
  {
    className: "text-sky",
    label: "Mid",
  },
  {
    className: "text-teal",
    label: "High",
  },
  {
    className: "text-gold",
    label: "Top",
  },
] as const satisfies readonly SelectionPriority[];

export const Route = createFileRoute("/")({
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
  const wordCount = useSelector(
    actor,
    (snapshot) => snapshot.context.summaries.length
  );
  const matchingWordCount = useSelector(
    actor,
    (snapshot) => snapshot.context.matchingSummaries.length
  );
  const todayAttemptCount = useSelector(
    actor,
    (snapshot) => snapshot.context.todayAttemptCount
  );
  const wordCountLabel =
    query.trim() === ""
      ? _formatWordCount({ count: wordCount })
      : `${_formatWordCount({ count: matchingWordCount })} of ${_formatWordCount({ count: wordCount })}`;
  const attemptCountLabel = `${todayAttemptCount} ${
    todayAttemptCount === 1 ? "attempt" : "attempts"
  }`;
  const summaryLabel = `${wordCountLabel} ・ ${attemptCountLabel} today`;

  return (
    <div className="grid w-full max-w-xl gap-2">
      <label className="relative">
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
          placeholder="Search words"
          type="search"
          value={query}
          onValueChange={(nextQuery) => {
            actor.trigger.changeQuery({
              query: nextQuery,
            });
          }}
        />
      </label>
      <p className="px-1 text-sm font-black text-ink-muted">{summaryLabel}</p>
    </div>
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
  const allSummaries = useSelector(
    actor,
    (snapshot) => snapshot.context.summaries
  );
  const selectionWeights = allSummaries.map(
    (summary) => summary.selectionWeight
  );
  const selectionPriorityScale = EffectArray.isReadonlyArrayNonEmpty(
    allSummaries
  )
    ? {
        maxWeight: Math.max(...selectionWeights),
        minWeight: Math.min(...selectionWeights),
      }
    : {
        maxWeight: 0,
        minWeight: 0,
      };

  if (!EffectArray.isReadonlyArrayNonEmpty(summaries)) {
    return (
      <div className="py-14 text-center">
        <div className="text-lg font-black">No words found</div>
        <div className="mt-2 text-sm font-semibold text-ink-muted">
          Add words or adjust the search text.
        </div>
      </div>
    );
  }

  return (
    <section className="divide-y divide-line">
      {summaries.map((summary) => (
        <WordHistoryDetailsDialog
          key={summary.word.text}
          selectionPriorityScale={selectionPriorityScale}
          summary={summary}
        />
      ))}
    </section>
  );
}

function WordHistoryDetailsDialog({
  selectionPriorityScale,
  summary,
}: {
  readonly selectionPriorityScale: SelectionPriorityScale;
  readonly summary: WordHistorySummary;
}) {
  const streakLabel =
    summary.correctStreak > 0
      ? `${summary.correctStreak} correct`
      : summary.incorrectStreak > 0
        ? `${summary.incorrectStreak} missed`
        : "None";
  const reviewStatusLabel =
    summary.nextReviewAt === undefined || summary.isDue
      ? "Due now"
      : `Paused until ${formatDateTime({ dateTime: summary.nextReviewAt })}`;

  return (
    <Dialog.Root>
      <article>
        <Dialog.Trigger
          type="button"
          className="grid w-full min-w-0 grid-cols-[max-content_minmax(0,1fr)_auto] items-center gap-3 px-3 py-4 text-left transition hover:bg-field focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky sm:gap-4"
        >
          <span className="min-w-max whitespace-nowrap text-xl font-black leading-tight">
            <WordText text={summary.word.text} />
          </span>
          <AttemptResultStrip attempts={summary.attempts} />
          <SelectionPriorityValue
            className="justify-self-end text-right text-sm font-black sm:text-base"
            scale={selectionPriorityScale}
            selectionWeight={summary.selectionWeight}
          />
        </Dialog.Trigger>
        <Dialog.Portal>
          <Dialog.Backdrop className={dialogBackdropClassName} />
          <Dialog.Popup className={dialogPopupClassName}>
            <div className="flex min-w-0 items-start justify-between gap-4">
              <div className="min-w-0">
                <Dialog.Title className="wrap-break-word text-2xl font-black leading-tight">
                  <WordText text={summary.word.text} />
                </Dialog.Title>
              </div>
              <Dialog.Close
                aria-label="Close word details"
                className={dialogIconButtonClassName}
              >
                <X size={16} strokeWidth={2.5} />
              </Dialog.Close>
            </div>
            <div className="min-h-0 overflow-y-auto overscroll-contain pr-1">
              <div className="grid gap-4">
                <Dialog.Description className="wrap-break-word text-sm font-bold leading-6 text-ink-muted">
                  {summary.word.translation}
                </Dialog.Description>
                {summary.word.description === undefined ? null : (
                  <p className="wrap-break-word text-sm font-semibold leading-6 text-ink-muted">
                    {summary.word.description}
                  </p>
                )}
                <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <WordHistoryStat
                    label="Level"
                    value={`Level ${summary.reviewLevel}`}
                  />
                  <WordHistoryStat
                    label="Progress"
                    value={`${summary.reviewProgress}/${summary.reviewProgressTarget}`}
                  />
                  <WordHistoryStat label="Review" value={reviewStatusLabel} />
                  <WordHistoryStat
                    label="Selection"
                    value={
                      <SelectionPriorityValue
                        scale={selectionPriorityScale}
                        selectionWeight={summary.selectionWeight}
                      />
                    }
                  />
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
                {summary.lastSubmittedAt === undefined ? null : (
                  <p className="text-xs font-black text-ink-muted">
                    Last attempted{" "}
                    {formatDateTime({ dateTime: summary.lastSubmittedAt })}
                  </p>
                )}
                {EffectArray.isReadonlyArrayNonEmpty(summary.attempts) ? (
                  <div className="divide-y divide-line">
                    {summary.attempts.map((attempt) => (
                      <WordHistoryAttemptRow
                        key={attempt.submission.id}
                        attempt={attempt}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="py-6 text-sm font-bold text-ink-muted">
                    No attempts yet.
                  </div>
                )}
              </div>
            </div>
          </Dialog.Popup>
        </Dialog.Portal>
      </article>
    </Dialog.Root>
  );
}

function AttemptResultStrip({
  attempts,
}: {
  readonly attempts: readonly WordHistoryAttempt[];
}) {
  const visibleAttempts = attempts.slice(0, VisibleAttemptLimit);
  const attemptLabel = EffectArray.isReadonlyArrayNonEmpty(attempts)
    ? attempts
        .map((attempt) =>
          attempt.result === "correct" ? "Correct" : "Incorrect"
        )
        .join(", ")
    : "No attempts yet";
  const hiddenCountMarkers = Array.from(
    { length: visibleAttempts.length + 1 },
    (_, visibleCount) => {
      const hiddenAttemptCount = attempts.length - visibleCount;

      if (hiddenAttemptCount <= 0) {
        return null;
      }

      return (
        <span
          key={visibleCount}
          aria-hidden="true"
          className={`word-history-attempt-hidden-count word-history-attempt-hidden-count-${visibleCount} shrink-0 text-xs font-black text-ink-muted`}
        >
          +{hiddenAttemptCount}
        </span>
      );
    }
  );

  return (
    <span
      aria-label={attemptLabel}
      className="word-history-attempt-strip flex min-w-0 items-center justify-end gap-2"
    >
      {EffectArray.isReadonlyArrayNonEmpty(visibleAttempts) ? (
        <>
          {hiddenCountMarkers}
          {visibleAttempts.map((attempt, attemptIndex) => (
            <span
              key={attempt.submission.id}
              className={`word-history-attempt-icon word-history-attempt-icon-${attemptIndex} shrink-0`}
            >
              <WordHistoryResultIcon result={attempt.result} size={18} />
            </span>
          ))}
        </>
      ) : (
        <span className="h-px w-6 rounded-full bg-line" />
      )}
    </span>
  );
}

function WordHistoryAttemptRow({
  attempt,
}: {
  readonly attempt: WordHistoryAttempt;
}) {
  const batchLabel =
    attempt.batch === undefined
      ? "Legacy"
      : `Batch ${attempt.batch.batchNumber}`;

  return (
    <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-3 py-4">
      <WordHistoryResultIcon result={attempt.result} size={20} />
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
}

function WordHistoryResultIcon({
  result,
  size,
}: {
  readonly result: WordHistoryAttempt["result"];
  readonly size: number;
}) {
  const isCorrect = result === "correct";
  const ResultIcon = isCorrect ? CircleCheck : CircleX;

  return (
    <ResultIcon
      aria-label={isCorrect ? "Correct" : "Incorrect"}
      className={isCorrect ? "shrink-0 text-teal" : "shrink-0 text-accent"}
      role="img"
      size={size}
      strokeWidth={2.5}
    />
  );
}

function SelectionPriorityValue({
  className,
  scale,
  selectionWeight,
}: {
  readonly className?: string;
  readonly scale: SelectionPriorityScale;
  readonly selectionWeight: number;
}) {
  const spread = scale.maxWeight - scale.minWeight;
  let selectionPriority: SelectionPriority;

  if (spread <= Number.EPSILON) {
    if (selectionWeight <= 1) {
      selectionPriority = SelectionPriorities[0];
    } else if (selectionWeight <= 20) {
      selectionPriority = SelectionPriorities[1];
    } else if (selectionWeight <= 50) {
      selectionPriority = SelectionPriorities[2];
    } else {
      selectionPriority = SelectionPriorities[3];
    }
  } else {
    const normalizedWeight = (selectionWeight - scale.minWeight) / spread;

    if (normalizedWeight <= 0.25) {
      selectionPriority = SelectionPriorities[0];
    } else if (normalizedWeight <= 0.5) {
      selectionPriority = SelectionPriorities[1];
    } else if (normalizedWeight <= 0.75) {
      selectionPriority = SelectionPriorities[2];
    } else {
      selectionPriority = SelectionPriorities[3];
    }
  }

  return (
    <span
      aria-label={`Practice priority: ${selectionPriority.label}`}
      className={`${className ?? ""} ${selectionPriority.className}`}
    >
      {selectionPriority.label}
    </span>
  );
}

function WordHistoryStat({
  label,
  value,
}: {
  readonly label: string;
  readonly value: ReactNode;
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

function _formatWordCount({ count }: { readonly count: number }) {
  return `${count} ${count === 1 ? "word" : "words"}`;
}
