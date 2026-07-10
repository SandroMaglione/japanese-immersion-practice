import { Button } from "@base-ui/react/button";
import { Dialog } from "@base-ui/react/dialog";
import { Input } from "@base-ui/react/input";
import { WordPracticeHistoryMachine } from "@jip/machines";
import { createFileRoute } from "@tanstack/react-router";
import { useMachine, useSelector } from "@xstate/react";
import { Array as EffectArray } from "effect";
import {
  CircleCheck,
  CircleX,
  LoaderCircle,
  RefreshCw,
  Search,
  X,
} from "lucide-react";
import type { ReactNode } from "react";
import type { Actor } from "xstate";

import { WordText } from "../components/word-text.tsx";
import { formatDateTime } from "../lib/format.ts";
import { RuntimeClient } from "../lib/runtime-client.ts";

const wordPracticeHistoryMachine =
  WordPracticeHistoryMachine.makeWordPracticeHistoryMachine({
    runtime: RuntimeClient,
  });

const dialogBackdropClassName = "fixed inset-0 bg-paper/70 backdrop-blur-sm";
const dialogPopupClassName =
  "fixed left-1/2 top-1/2 grid h-[min(calc(100svh-1rem),44rem)] w-[min(calc(100vw-1rem),44rem)] -translate-x-1/2 -translate-y-1/2 grid-rows-[auto_minmax(0,1fr)] gap-4 overflow-hidden rounded-md border border-line bg-panel p-4 text-ink shadow-[0_24px_80px_rgba(0,0,0,0.45)] focus:outline-none sm:h-[min(calc(100svh-2rem),44rem)] sm:w-[min(calc(100vw-2rem),44rem)] sm:gap-5 sm:p-5";
const dialogIconButtonClassName =
  "inline-flex size-9 shrink-0 items-center justify-center rounded-md border border-line bg-panel text-ink-muted transition hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky";

type WordPracticeHistoryActor = Actor<typeof wordPracticeHistoryMachine>;
type WordHistoryAttempt = ReturnType<
  WordPracticeHistoryActor["getSnapshot"]
>["context"]["selectedAttempts"][number];

const StatusLabels = {
  due: "Due",
  learning: "Learning",
  new: "New",
  relearning: "Relearning",
  scheduled: "Scheduled",
} as const;

export const Route = createFileRoute("/")({
  component: WordHistoryRoute,
});

function WordHistoryRoute() {
  const [snapshot, , actor] = useMachine(wordPracticeHistoryMachine);
  const isFailure = snapshot.value === "Failure";
  const isLoading = snapshot.value === "Loading";
  const isReady =
    snapshot.value === "Ready" || snapshot.value === "LoadingAttempts";

  return (
    <div className="flex flex-col gap-6">
      <section className="flex justify-center">
        <WordHistorySearch actor={actor} />
      </section>
      {isLoading ? (
        <div className="py-10 text-center text-sm font-bold text-ink-muted">
          Loading word history
        </div>
      ) : null}
      {isFailure ? (
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
      {isReady ? (
        <>
          <WordHistoryList actor={actor} />
          <WordHistoryDialog actor={actor} />
        </>
      ) : null}
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
          aria-label="Search word history"
          autoComplete="off"
          className="h-12 w-full rounded-md border border-line bg-field pl-11 pr-4 text-base font-bold outline-none transition placeholder:text-ink-muted/70 focus:border-ink-muted"
          placeholder="Search words"
          type="search"
          value={query}
          onValueChange={(nextQuery) => {
            actor.trigger.changeQuery({ query: nextQuery });
          }}
        />
      </label>
      <p className="px-1 text-sm font-black text-ink-muted">
        {wordCountLabel} ・ {todayAttemptCount} attempts today
      </p>
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
  const visibleSummaryCount = useSelector(
    actor,
    (snapshot) => snapshot.context.visibleSummaryCount
  );
  const visibleSummaries = summaries.slice(0, visibleSummaryCount);

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
    <div>
      <section className="divide-y divide-line">
        {visibleSummaries.map((summary) => (
          <button
            key={summary.word.id}
            type="button"
            className="grid w-full min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-4 px-3 py-4 text-left transition hover:bg-field focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky"
            onClick={() => {
              actor.trigger.selectWord({ wordId: summary.word.id });
            }}
          >
            <div className="min-w-0">
              <span className="wrap-break-word text-xl font-black leading-tight">
                <WordText text={summary.word.text} />
              </span>
              <p className="mt-1 text-xs font-bold text-ink-muted">
                {summary.attemptCount} attempts · {summary.accuracy}% correct
              </p>
            </div>
            <div className="text-right">
              <p
                className={`text-sm font-black ${summary.isDue ? "text-gold" : "text-ink"}`}
              >
                {StatusLabels[summary.status]}
              </p>
              <p className="mt-1 text-xs font-bold text-ink-muted">
                {Math.round(summary.retrievability * 100)}% recall
              </p>
            </div>
          </button>
        ))}
      </section>
      {visibleSummaries.length < summaries.length ? (
        <div className="flex justify-center py-6">
          <Button
            type="button"
            className="h-10 rounded-md border border-line bg-panel px-4 text-sm font-black text-ink-muted transition hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky"
            onClick={() => {
              actor.trigger.loadMore();
            }}
          >
            Load more
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function WordHistoryDialog({
  actor,
}: {
  readonly actor: WordPracticeHistoryActor;
}) {
  const selectedWordId = useSelector(
    actor,
    (snapshot) => snapshot.context.selectedWordId
  );
  const summary = useSelector(actor, (snapshot) =>
    snapshot.context.summaries.find(
      (candidate) => candidate.word.id === snapshot.context.selectedWordId
    )
  );
  const attempts = useSelector(
    actor,
    (snapshot) => snapshot.context.selectedAttempts
  );
  const isLoading = useSelector(actor, (snapshot) =>
    snapshot.matches("LoadingAttempts")
  );

  return (
    <Dialog.Root
      open={selectedWordId !== undefined}
      onOpenChange={(open) => {
        if (!open) {
          actor.trigger.closeWord();
        }
      }}
    >
      <Dialog.Portal>
        <Dialog.Backdrop className={dialogBackdropClassName} />
        <Dialog.Popup className={dialogPopupClassName}>
          <div className="flex min-w-0 items-start justify-between gap-4">
            <Dialog.Title className="min-w-0 wrap-break-word text-2xl font-black leading-tight">
              {summary === undefined ? (
                "Word history"
              ) : (
                <WordText text={summary.word.text} />
              )}
            </Dialog.Title>
            <Dialog.Close
              aria-label="Close word details"
              className={dialogIconButtonClassName}
            >
              <X size={16} strokeWidth={2.5} />
            </Dialog.Close>
          </div>
          <div className="min-h-0 overflow-y-auto overscroll-contain pr-1">
            {summary === undefined ? null : (
              <WordHistoryDetails
                attempts={attempts}
                isLoading={isLoading}
                summary={summary}
              />
            )}
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function WordHistoryDetails({
  attempts,
  isLoading,
  summary,
}: {
  readonly attempts: readonly WordHistoryAttempt[];
  readonly isLoading: boolean;
  readonly summary: ReturnType<
    WordPracticeHistoryActor["getSnapshot"]
  >["context"]["summaries"][number];
}) {
  const stability =
    summary.state.stability < 1
      ? `${Math.max(1, Math.round(summary.state.stability * 24))} hours`
      : `${Math.round(summary.state.stability)} days`;

  return (
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
        <WordHistoryStat label="Status" value={StatusLabels[summary.status]} />
        <WordHistoryStat
          label="Recall"
          value={`${Math.round(summary.retrievability * 100)}%`}
        />
        <WordHistoryStat label="Stability" value={stability} />
        <WordHistoryStat
          label="Next"
          value={
            summary.isDue
              ? "Due now"
              : formatDateTime({ dateTime: summary.state.dueAt })
          }
        />
        <WordHistoryStat label="Accuracy" value={`${summary.accuracy}%`} />
        <WordHistoryStat label="Attempts" value={`${summary.attemptCount}`} />
        <WordHistoryStat label="Correct" value={`${summary.correctCount}`} />
        <WordHistoryStat label="Lapses" value={`${summary.state.lapses}`} />
      </dl>
      <p className="text-xs font-black text-ink-muted">
        Last practiced{" "}
        {formatDateTime({ dateTime: summary.state.lastPracticedAt })}
      </p>
      {isLoading ? (
        <div className="flex items-center justify-center gap-2 py-8 text-sm font-bold text-ink-muted">
          <LoaderCircle className="animate-spin" size={18} strokeWidth={2.5} />
          Loading attempts
        </div>
      ) : !EffectArray.isReadonlyArrayNonEmpty(attempts) ? (
        <div className="py-6 text-sm font-bold text-ink-muted">
          No attempts yet.
        </div>
      ) : (
        <div className="divide-y divide-line">
          {attempts.map((attempt) => (
            <WordHistoryAttemptRow key={attempt.id} attempt={attempt} />
          ))}
        </div>
      )}
    </div>
  );
}

function WordHistoryAttemptRow({
  attempt,
}: {
  readonly attempt: WordHistoryAttempt;
}) {
  const isCorrect = attempt.result === "correct";
  const ResultIcon = isCorrect ? CircleCheck : CircleX;
  const sourceLabel =
    attempt.kind === "extra"
      ? "Extra practice"
      : `${attempt.source.charAt(0).toLocaleUpperCase()}${attempt.source.slice(1)}`;

  return (
    <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-3 py-4">
      <ResultIcon
        aria-label={isCorrect ? "Correct" : "Incorrect"}
        className={isCorrect ? "shrink-0 text-teal" : "shrink-0 text-accent"}
        role="img"
        size={20}
        strokeWidth={2.5}
      />
      <div className="min-w-0">
        <p className="wrap-break-word whitespace-pre-wrap text-base font-black leading-7">
          {attempt.submittedText.trim() === ""
            ? "Blank answer"
            : attempt.submittedText}
        </p>
        <p className="mt-1 text-xs font-bold text-ink-muted">
          {sourceLabel} · {formatDateTime({ dateTime: attempt.reviewedAt })}
        </p>
      </div>
    </div>
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

const _formatWordCount = ({ count }: { readonly count: number }) =>
  `${count} ${count === 1 ? "word" : "words"}`;
