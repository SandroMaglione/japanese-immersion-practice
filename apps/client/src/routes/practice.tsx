import { Button } from "@base-ui/react/button";
import { Input } from "@base-ui/react/input";
import { Tooltip } from "@base-ui/react/tooltip";
import { PracticeOverviewMachine } from "@jip/machines";
import { Link, createFileRoute } from "@tanstack/react-router";
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

import { WordText } from "../components/word-text.tsx";
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
  const isEmptyLibrary = snapshot.value === "EmptyLibrary";
  const isFailure = snapshot.value === "Failure";
  const isLoading = snapshot.value === "Loading";
  const isRevealed = snapshot.value === "Revealed";
  const isSubmitting = snapshot.value === "Submitting";

  if (isLoading) {
    return (
      <div className="py-10 text-center text-sm font-bold text-ink-muted">
        Loading practice data
      </div>
    );
  }

  if (isFailure) {
    return (
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
    );
  }

  if (isEmptyLibrary) {
    return (
      <section className="flex min-w-0 flex-col items-center justify-center gap-4 py-14 text-center sm:min-h-[calc(100svh-12rem)] sm:py-6">
        <div>
          <div className="text-lg font-black">No words yet</div>
          <div className="mt-1 text-sm font-semibold text-ink-muted">
            Add a few entries to begin a continuous practice session.
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
    <PracticeSession
      actor={actor}
      isRevealed={isRevealed}
      isSubmitting={isSubmitting}
    />
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
  const currentItem = useSelector(
    actor,
    (snapshot) => snapshot.context.currentItem
  );
  const currentResponse = useSelector(
    actor,
    (snapshot) => snapshot.context.currentResponse
  );
  const lastResult = useSelector(
    actor,
    (snapshot) => snapshot.context.lastResult
  );
  const message = useSelector(actor, (snapshot) => snapshot.context.message);
  const stats = useSelector(actor, (snapshot) => snapshot.context.stats);
  const isShowingResult = isRevealed && lastResult !== undefined;
  const ResultIcon = lastResult?.isCorrect === true ? CircleCheck : CircleX;
  const displayedPhase = isShowingResult
    ? lastResult.phaseAfter
    : currentItem?.state.phase;
  const displayedKind = isShowingResult ? lastResult.kind : currentItem?.kind;
  const isExtraPractice = displayedKind === "extra";
  const statusLabel = isExtraPractice
    ? "Extra practice"
    : displayedPhase === "new"
      ? "New"
      : displayedPhase === "learning"
        ? "Learning"
        : displayedPhase === "relearning"
          ? "Relearning"
          : isShowingResult
            ? "Scheduled"
            : "Due review";
  const statusClassName = isExtraPractice
    ? "border-gold/35 bg-gold-soft text-gold"
    : displayedPhase === "new"
      ? "border-sky/35 bg-sky/10 text-sky"
      : displayedPhase === "learning"
        ? "border-teal/35 bg-teal-soft text-teal"
        : displayedPhase === "relearning"
          ? "border-accent/35 bg-accent-soft text-accent"
          : isShowingResult
            ? "border-line bg-field text-ink"
            : "border-gold/35 bg-gold-soft text-gold";

  return (
    <section className="grid h-[calc(100svh-9.5rem)] min-h-0 min-w-0 grid-rows-[2.75rem_minmax(0,1fr)] gap-2 overflow-hidden py-1 sm:h-auto sm:min-h-[calc(100svh-12rem)] sm:grid-rows-[2.75rem_minmax(0,1fr)] sm:gap-4 sm:py-6">
      <header
        className={`mx-auto flex h-11 w-full max-w-xl items-center justify-between gap-3 rounded-lg border px-3 shadow-[0_4px_14px_rgba(0,0,0,0.1)] transition-colors ${isExtraPractice ? "border-gold/50 bg-gold-soft/45" : "border-line bg-panel"}`}
      >
        <div className="flex min-w-0 items-center gap-2.5">
          <strong className="text-2xl font-black tabular-nums leading-none text-ink">
            {stats.attemptCount}
          </strong>
          <span aria-hidden="true" className="text-xs text-ink-muted">
            ・
          </span>
          <span
            aria-label={`${stats.correctCount} correct`}
            className="inline-flex items-center gap-1 text-xs font-black tabular-nums text-sky"
          >
            <CircleCheck aria-hidden="true" size={14} strokeWidth={2.5} />
            {stats.correctCount}
          </span>
          <span
            aria-label={`${stats.attemptCount - stats.correctCount} incorrect`}
            className="inline-flex items-center gap-1 text-xs font-black tabular-nums text-berry"
          >
            <CircleX aria-hidden="true" size={14} strokeWidth={2.5} />
            {stats.attemptCount - stats.correctCount}
          </span>
        </div>
        <span
          aria-live="polite"
          className={`inline-flex min-h-6 items-center rounded-full border px-2.5 text-[0.7rem] font-black ${statusClassName}`}
        >
          {statusLabel}
        </span>
      </header>
      <form
        className="mx-auto grid min-h-0 w-full max-w-xl min-w-0 grid-rows-[minmax(0,1fr)_3.5rem_3.5rem] gap-3 overflow-hidden pb-10 text-center sm:grid-rows-[minmax(0,1fr)_3.5rem_4rem] sm:gap-5"
        onSubmit={(event) => {
          event.preventDefault();
          actor.trigger.submit();
        }}
      >
        <div className="flex min-h-0 w-full flex-col items-center justify-center gap-3 overflow-y-auto overscroll-contain px-1">
          {isShowingResult ? (
            <div className="grid w-full gap-3">
              <ResultIcon
                aria-label={lastResult.isCorrect ? "Correct" : "Incorrect"}
                className={`justify-self-center ${lastResult.isCorrect ? "text-sky" : "text-berry"}`}
                role="img"
                size={34}
                strokeWidth={2.5}
              />
              <h1 className="w-full wrap-break-word text-4xl font-black leading-tight sm:text-7xl">
                <WordText text={lastResult.word.text} />
              </h1>
              <p className="w-full wrap-break-word text-lg font-black leading-tight text-ink-muted sm:text-2xl">
                {lastResult.word.translation}
              </p>
              {lastResult.word.description === undefined ? null : (
                <p className="max-w-lg justify-self-center text-sm font-semibold leading-6 text-ink-muted">
                  {lastResult.word.description}
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
          <Tooltip.Root>
            <Tooltip.Trigger
              render={
                <Button
                  type="button"
                  aria-label="Next"
                  autoFocus
                  className="inline-flex h-14 w-14 items-center justify-center justify-self-center rounded-md bg-action text-action-ink transition hover:bg-action-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky"
                  onClick={() => {
                    actor.trigger.submit();
                  }}
                />
              }
            >
              <ArrowRight aria-hidden="true" size={20} strokeWidth={2.5} />
            </Tooltip.Trigger>
            <Tooltip.Portal>
              <Tooltip.Positioner sideOffset={8}>
                <Tooltip.Popup className="rounded-md border border-line bg-panel px-2 py-1 text-xs font-black text-ink shadow-[0_12px_35px_rgba(0,0,0,0.35)]">
                  Next
                </Tooltip.Popup>
              </Tooltip.Positioner>
            </Tooltip.Portal>
          </Tooltip.Root>
        ) : (
          <div className="flex w-full min-w-0 gap-2">
            <label className="sr-only" htmlFor="practice-response">
              Japanese word
            </label>
            <Input
              id="practice-response"
              autoCapitalize="none"
              autoComplete="off"
              autoCorrect="off"
              autoFocus
              className="h-14 min-w-0 flex-1 rounded-md border border-line bg-field px-4 text-center text-xl font-bold outline-none transition placeholder:text-ink-muted/70 focus:border-ink-muted disabled:opacity-60"
              disabled={isSubmitting}
              placeholder="日本語"
              spellCheck={false}
              type="text"
              value={currentResponse}
              onValueChange={(response) => {
                actor.trigger.changeResponse({ response });
              }}
              onKeyDown={(event) => {
                if (event.key !== "Enter" || event.nativeEvent.isComposing) {
                  return;
                }

                event.preventDefault();
                actor.trigger.submit();
              }}
            />
            <Tooltip.Root>
              <Tooltip.Trigger
                render={
                  <Button
                    type="submit"
                    aria-label="Submit"
                    className="inline-flex h-14 w-14 shrink-0 items-center justify-center rounded-md bg-action text-action-ink transition hover:bg-action-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky disabled:bg-field disabled:text-ink-muted"
                    disabled={isSubmitting}
                    focusableWhenDisabled
                  />
                }
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
              </Tooltip.Trigger>
              <Tooltip.Portal>
                <Tooltip.Positioner sideOffset={8}>
                  <Tooltip.Popup className="rounded-md border border-line bg-panel px-2 py-1 text-xs font-black text-ink shadow-[0_12px_35px_rgba(0,0,0,0.35)]">
                    Submit
                  </Tooltip.Popup>
                </Tooltip.Positioner>
              </Tooltip.Portal>
            </Tooltip.Root>
          </div>
        )}
        <div className="grid min-h-14 w-full justify-items-center gap-1 text-sm font-bold leading-6 text-ink-muted">
          {message === undefined ? null : (
            <span className="text-accent">{message}</span>
          )}
          {lastResult === undefined ? null : (
            <>
              <span
                className={lastResult.isCorrect ? "text-teal" : "text-accent"}
              >
                {lastResult.isCorrect ? "Correct" : "Incorrect"} ·{" "}
                {lastResult.kind === "extra"
                  ? "Extra practice"
                  : lastResult.phaseAfter.charAt(0).toLocaleUpperCase() +
                    lastResult.phaseAfter.slice(1)}
              </span>
              <span>
                {lastResult.changedSchedule
                  ? `Next ${formatDateTime({ dateTime: lastResult.nextReviewAt })}`
                  : `Schedule unchanged · Next ${formatDateTime({ dateTime: lastResult.nextReviewAt })}`}
              </span>
            </>
          )}
        </div>
      </form>
    </section>
  );
}
