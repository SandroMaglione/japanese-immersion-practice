import { Button } from "@base-ui/react/button";
import { Input } from "@base-ui/react/input";
import { Tooltip } from "@base-ui/react/tooltip";
import { PracticeOverviewMachine } from "@jip/machines";
import { WordPracticePresentation } from "@jip/services";
import { Link, createFileRoute } from "@tanstack/react-router";
import { useMachine, useSelector } from "@xstate/react";
import {
  ArrowRight,
  Check,
  CircleCheck,
  CircleX,
  Lightbulb,
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

function PracticeExampleSentence({
  template,
  wordText,
}: {
  readonly template: string;
  readonly wordText?: string;
}) {
  const markerIndex = template.indexOf(WordPracticePresentation.WordMarker);
  const before = template.slice(0, markerIndex);
  const after = template.slice(
    markerIndex + WordPracticePresentation.WordMarker.length
  );

  return (
    <>
      <WordText text={before} />
      {wordText === undefined ? (
        <span
          aria-label="Missing word"
          className="mx-1 inline-block min-w-16 border-b-2 border-current align-baseline"
        >
          &nbsp;
        </span>
      ) : (
        <span className="font-black text-sky">
          <WordText text={wordText} />
        </span>
      )}
      <WordText text={after} />
    </>
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
  const hintVisible = useSelector(
    actor,
    (snapshot) => snapshot.context.hintVisible
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
  const statusTextClassName = isExtraPractice
    ? "text-gold"
    : displayedPhase === "new"
      ? "text-sky"
      : displayedPhase === "learning"
        ? "text-teal"
        : displayedPhase === "relearning"
          ? "text-accent"
          : isShowingResult
            ? "text-ink-muted"
            : "text-gold";

  return (
    <section className="h-[calc(100svh-9.5rem)] min-h-0 min-w-0 overflow-hidden py-1 sm:h-auto sm:min-h-[calc(100svh-12rem)] sm:py-6">
      <form
        className="mx-auto flex h-full min-h-0 w-full max-w-xl min-w-0 flex-col items-start gap-3 overflow-hidden text-center sm:gap-5"
        onSubmit={(event) => {
          event.preventDefault();
          actor.trigger.submit();
        }}
      >
        <div className="grid w-full shrink-0 content-start justify-items-center gap-3 px-1 pt-1">
          {isShowingResult ? (
            <div className="grid w-full gap-3">
              <ResultIcon
                aria-label={lastResult.isCorrect ? "Correct" : "Incorrect"}
                className={`justify-self-center ${lastResult.isCorrect ? "text-sky" : "text-berry"}`}
                role="img"
                size={34}
                strokeWidth={2.5}
              />
              {lastResult.example === undefined ? (
                <h1 className="w-full wrap-break-word text-4xl font-black leading-tight sm:text-7xl">
                  <WordText text={lastResult.word.text} />
                </h1>
              ) : (
                <h1 className="w-full wrap-break-word text-xl font-normal leading-relaxed sm:text-3xl">
                  <PracticeExampleSentence
                    template={lastResult.example.template}
                    wordText={lastResult.word.text}
                  />
                </h1>
              )}
              <p className="w-full wrap-break-word text-lg font-normal leading-tight text-ink-muted sm:text-2xl">
                {lastResult.word.translation}
              </p>
              {lastResult.example === undefined ? null : (
                <p className="w-full wrap-break-word text-sm font-semibold leading-6 text-ink-muted sm:text-base">
                  {lastResult.example.translation}
                </p>
              )}
              {lastResult.example?.note === undefined ? null : (
                <p className="max-w-lg justify-self-center text-sm font-semibold leading-6 text-gold">
                  {lastResult.example.note}
                </p>
              )}
              {lastResult.word.description === undefined ? null : (
                <p className="max-w-lg justify-self-center text-sm font-semibold leading-6 text-ink-muted">
                  {lastResult.word.description}
                </p>
              )}
            </div>
          ) : currentItem === undefined ? null : (
            <div className="grid w-full gap-2 sm:gap-3">
              {currentItem.example === undefined ? (
                <>
                  <h1
                    className={`w-full wrap-break-word font-normal leading-tight ${
                      currentItem.word.description === undefined
                        ? "text-2xl sm:text-3xl"
                        : "text-xl sm:text-2xl"
                    }`}
                  >
                    {currentItem.word.description ??
                      currentItem.word.translation}
                  </h1>
                  {currentItem.word.description === undefined ? null : (
                    <p className="w-full wrap-break-word text-xs font-normal leading-5 text-ink-muted sm:text-sm">
                      {currentItem.word.translation}
                    </p>
                  )}
                </>
              ) : (
                <>
                  <h1 className="w-full wrap-break-word text-xl font-normal leading-relaxed sm:text-3xl">
                    <PracticeExampleSentence
                      template={currentItem.example.template}
                    />
                  </h1>
                  {hintVisible ? (
                    <p
                      aria-live="polite"
                      className="w-full wrap-break-word text-sm font-semibold leading-6 text-ink-muted"
                    >
                      {currentItem.example.translation}
                    </p>
                  ) : null}
                </>
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
                  className="inline-flex h-14 w-14 items-center justify-center self-center rounded-md bg-action text-action-ink transition hover:bg-action-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky"
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
          <div className="mt-10 flex w-full min-w-0 gap-2">
            {currentItem?.example === undefined || hintVisible ? null : (
              <Tooltip.Root>
                <Tooltip.Trigger
                  render={
                    <Button
                      type="button"
                      aria-label="Show hint"
                      className="inline-flex h-14 w-14 shrink-0 items-center justify-center rounded-md border border-line bg-panel text-ink-muted transition hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky disabled:opacity-60"
                      disabled={isSubmitting}
                      focusableWhenDisabled
                      onClick={() => {
                        actor.trigger.showHint();
                      }}
                    />
                  }
                >
                  <Lightbulb aria-hidden="true" size={20} strokeWidth={2.5} />
                </Tooltip.Trigger>
                <Tooltip.Portal>
                  <Tooltip.Positioner sideOffset={8}>
                    <Tooltip.Popup className="rounded-md border border-line bg-panel px-2 py-1 text-xs font-black text-ink shadow-[0_12px_35px_rgba(0,0,0,0.35)]">
                      Show hint
                    </Tooltip.Popup>
                  </Tooltip.Positioner>
                </Tooltip.Portal>
              </Tooltip.Root>
            )}
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
        <div
          aria-label="Session progress"
          aria-live="polite"
          className="flex min-h-5 w-full flex-wrap items-center justify-center gap-x-2.5 gap-y-1 text-xs font-black tabular-nums text-ink-muted"
        >
          <span className="inline-flex items-baseline gap-1">
            <span>{stats.attemptCount}</span>
            <span>total</span>
          </span>
          <span aria-hidden="true">・</span>
          <span
            aria-label={`${stats.correctCount} correct`}
            className="inline-flex items-center gap-1 text-sky"
          >
            <CircleCheck aria-hidden="true" size={14} strokeWidth={2.5} />
            {stats.correctCount}
          </span>
          <span
            aria-label={`${stats.attemptCount - stats.correctCount} incorrect`}
            className="inline-flex items-center gap-1 text-berry"
          >
            <CircleX aria-hidden="true" size={14} strokeWidth={2.5} />
            {stats.attemptCount - stats.correctCount}
          </span>
          <span aria-hidden="true">・</span>
          <span className={statusTextClassName}>{statusLabel}</span>
        </div>
        <div className="grid w-full justify-items-center gap-1 text-center text-xs font-normal leading-5 text-ink-muted">
          {message === undefined ? null : (
            <span className="font-bold text-accent">{message}</span>
          )}
          {lastResult === undefined ? null : (
            <span>
              Next {formatDateTime({ dateTime: lastResult.nextReviewAt })}
            </span>
          )}
        </div>
      </form>
    </section>
  );
}
