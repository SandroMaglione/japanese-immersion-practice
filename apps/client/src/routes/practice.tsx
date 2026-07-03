import { PracticeOverviewMachine } from "@jip/machines";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMachine, useSelector } from "@xstate/react";
import {
  ArrowRight,
  Check,
  CircleCheck,
  CircleX,
  LoaderCircle,
  RefreshCw,
} from "lucide-react";
import type { Actor } from "xstate";

import { KanjiWordText } from "../components/kanji-word-text.tsx";
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
  const isPracticeReady = snapshot.matches("Ready");
  const isPracticeRevealed = snapshot.matches("Revealed");
  const isPracticeRefreshing = snapshot.matches("RefreshingBatch");
  const isPracticeSubmitting = snapshot.matches("Submitting");

  return (
    <div className="flex min-w-0 flex-col gap-5 sm:gap-6">
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
      {isPracticeReady ||
      isPracticeRevealed ||
      isPracticeRefreshing ||
      isPracticeSubmitting ? (
        <PracticeSession
          actor={actor}
          isRevealed={isPracticeRevealed}
          isSubmitting={isPracticeSubmitting || isPracticeRefreshing}
        />
      ) : null}
    </div>
  );
}

function PracticeSession({
  actor,
  isRevealed,
  isSubmitting,
}: {
  readonly actor: Actor<typeof practiceOverviewMachine>;
  readonly isRevealed: boolean;
  readonly isSubmitting: boolean;
}) {
  const currentResponse = useSelector(
    actor,
    (snapshot) => snapshot.context.currentResponse
  );
  const kanjiEntries = useSelector(
    actor,
    (snapshot) => snapshot.context.kanjiEntries
  );
  const lastResult = useSelector(
    actor,
    (snapshot) => snapshot.context.lastResult
  );
  const message = useSelector(actor, (snapshot) => snapshot.context.message);
  const batch = useSelector(actor, (snapshot) => snapshot.context.batch);
  const queue = useSelector(actor, (snapshot) => snapshot.context.queue);
  const currentItem = queue[0];
  const isShowingResult = isRevealed && lastResult !== undefined;
  const ResultIcon = lastResult?.isCorrect === true ? CircleCheck : CircleX;
  const resultIconLabel =
    lastResult?.isCorrect === true ? "Correct" : "Incorrect";
  const resultIconColor =
    lastResult?.isCorrect === true ? "text-sky" : "text-berry";
  const batchProgressPercent =
    batch === undefined || batch.totalCount === 0
      ? 0
      : Math.round((batch.completedCount / batch.totalCount) * 100);

  if (currentItem === undefined && !isShowingResult) {
    return (
      <section className="flex min-w-0 flex-col justify-start gap-4 py-14 text-center sm:min-h-[calc(100svh-12rem)] sm:items-center sm:justify-center sm:py-6">
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
      </section>
    );
  }

  return (
    <section className="flex min-w-0 flex-col gap-8 py-2 sm:grid sm:min-h-[calc(100svh-12rem)] sm:grid-cols-[minmax(0,1fr)] sm:grid-rows-[3.5rem_minmax(0,1fr)] sm:gap-0 sm:py-6">
      <div className="mx-auto flex w-full max-w-full min-w-0 items-center gap-3 sm:max-w-xl">
        <button
          type="button"
          aria-label="Refresh batch"
          title="Refresh batch"
          className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-ink-muted transition hover:bg-field hover:text-ink"
          disabled={isSubmitting}
          onClick={() => {
            actor.trigger.refresh();
          }}
        >
          <RefreshCw size={16} strokeWidth={2.5} />
        </button>
        {batch === undefined ? null : (
          <div className="grid min-w-0 flex-1 gap-2 text-left">
            <div className="flex min-w-0 items-center justify-between gap-3 text-xs font-black uppercase text-ink-muted">
              <span>Batch {batch.batchNumber}</span>
              <span className="shrink-0">
                {batch.completedCount} / {batch.totalCount}
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-sm bg-field">
              <div
                className="h-full rounded-sm bg-teal transition-[width]"
                style={{
                  width: `${batchProgressPercent}%`,
                }}
              />
            </div>
          </div>
        )}
      </div>
      <form
        className="mx-auto flex min-h-0 w-full max-w-full min-w-0 flex-col items-center justify-start gap-5 text-center sm:max-w-xl sm:justify-center sm:gap-8"
        onSubmit={(event) => {
          event.preventDefault();
          actor.trigger.submit();
        }}
      >
        <div className="flex min-h-36 w-full flex-col items-center justify-center gap-3 sm:min-h-48">
          {isShowingResult ? (
            <div className="grid w-full gap-3">
              <ResultIcon
                aria-label={resultIconLabel}
                className={`justify-self-center ${resultIconColor}`}
                role="img"
                size={34}
                strokeWidth={2.5}
              />
              <h1 className="w-full wrap-break-word text-4xl font-black leading-tight sm:text-7xl">
                <KanjiWordText
                  kanjiEntries={kanjiEntries}
                  text={lastResult.wordText}
                />
              </h1>
              <p className="w-full wrap-break-word text-lg font-black leading-tight text-ink-muted sm:text-2xl">
                {lastResult.wordTranslation}
              </p>
              {lastResult.wordDescription === undefined ? null : (
                <p className="max-w-lg justify-self-center text-sm font-semibold leading-6 text-ink-muted">
                  {lastResult.wordDescription}
                </p>
              )}
            </div>
          ) : currentItem === undefined ? null : (
            <div className="grid w-full gap-2 sm:gap-3">
              <h1
                className={`w-full wrap-break-word font-black leading-tight ${
                  currentItem.word.description === undefined
                    ? "text-2xl sm:text-3xl"
                    : "text-xl sm:text-2xl"
                }`}
              >
                {currentItem.word.description ?? currentItem.word.translation}
              </h1>
              {currentItem.word.description === undefined ? null : (
                <p className="w-full wrap-break-word text-xs font-bold leading-5 text-ink-muted sm:text-sm">
                  {currentItem.word.translation}
                </p>
              )}
            </div>
          )}
        </div>
        {isShowingResult ? (
          <button
            type="button"
            aria-label="Next"
            title="Next"
            autoFocus
            className="inline-flex h-14 w-14 items-center justify-center rounded-md bg-action text-action-ink transition hover:bg-action-hover"
            onClick={() => {
              actor.trigger.submit();
            }}
            onKeyDown={(event) => {
              if (event.key !== "Enter" && event.key !== " ") {
                return;
              }

              event.preventDefault();
              actor.trigger.submit();
            }}
          >
            <ArrowRight aria-hidden="true" size={20} strokeWidth={2.5} />
          </button>
        ) : (
          <div className="flex w-full min-w-0 gap-2">
            <label className="sr-only" htmlFor="practice-response">
              Japanese word
            </label>
            <input
              id="practice-response"
              autoComplete="off"
              autoFocus
              className="h-14 min-w-0 flex-1 rounded-md border border-line bg-field px-4 text-center text-xl font-bold outline-none transition placeholder:text-ink-muted/70 focus:border-ink-muted disabled:opacity-60"
              disabled={isSubmitting}
              placeholder="日本語"
              spellCheck={false}
              type="text"
              value={currentResponse}
              onChange={(event) => {
                actor.trigger.changeResponse({
                  response: event.currentTarget.value,
                });
              }}
              onKeyDown={(event) => {
                if (event.key !== "Enter" || event.nativeEvent.isComposing) {
                  return;
                }

                event.preventDefault();
                actor.trigger.submit();
              }}
            />
            <button
              type="submit"
              aria-label="Submit"
              title="Submit"
              className="inline-flex h-14 w-14 shrink-0 items-center justify-center rounded-md bg-action text-action-ink transition hover:bg-action-hover disabled:bg-field disabled:text-ink-muted"
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <LoaderCircle
                  aria-hidden="true"
                  className="animate-spin"
                  size={20}
                  strokeWidth={2.5}
                />
              ) : (
                <Check aria-hidden="true" size={20} strokeWidth={2.5} />
              )}
            </button>
          </div>
        )}
        <div className="min-h-12 text-sm font-bold leading-6 text-ink-muted">
          {message !== undefined ? (
            <span className="text-accent">{message}</span>
          ) : lastResult !== undefined ? (
            lastResult.batchCompleted === undefined ? (
              <span>
                <span
                  className={lastResult.isCorrect ? "text-teal" : "text-accent"}
                >
                  {lastResult.isCorrect ? "Correct" : "Incorrect"}
                </span>
                <span className="text-ink-muted">
                  {" "}
                  · Batch {lastResult.batchNumber}
                </span>
              </span>
            ) : (
              <span>
                <span
                  className={lastResult.isCorrect ? "text-teal" : "text-accent"}
                >
                  {lastResult.isCorrect ? "Correct" : "Incorrect"}
                </span>
                <span className="text-ink-muted">
                  {" "}
                  · Batch {lastResult.batchCompleted.batchNumber} complete ·{" "}
                  {lastResult.batchCompleted.correctCount}/
                  {lastResult.batchCompleted.totalCount} correct
                </span>
              </span>
            )
          ) : null}
        </div>
      </form>
    </section>
  );
}
