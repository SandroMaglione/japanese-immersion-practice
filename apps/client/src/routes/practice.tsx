import { Button } from "@base-ui/react/button";
import { Input } from "@base-ui/react/input";
import { Progress } from "@base-ui/react/progress";
import { Tooltip } from "@base-ui/react/tooltip";
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

import { WordText } from "../components/word-text.tsx";
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
  const isPracticeBatchFinished = snapshot.matches("BatchFinished");
  const isPracticeReady = snapshot.matches("Ready");
  const isPracticeRevealed = snapshot.matches("Revealed");
  const isPracticeRefreshing = snapshot.matches("RefreshingBatch");
  const isPracticeStartingBatch = snapshot.matches("StartingBatch");
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
      {isPracticeReady ||
      isPracticeBatchFinished ||
      isPracticeRevealed ||
      isPracticeRefreshing ||
      isPracticeStartingBatch ||
      isPracticeSubmitting ? (
        <PracticeSession
          actor={actor}
          isBatchFinished={isPracticeBatchFinished}
          isRevealed={isPracticeRevealed}
          isStartingBatch={isPracticeStartingBatch}
          isSubmitting={
            isPracticeSubmitting ||
            isPracticeRefreshing ||
            isPracticeStartingBatch
          }
        />
      ) : null}
    </div>
  );
}

function PracticeSession({
  actor,
  isBatchFinished,
  isRevealed,
  isStartingBatch,
  isSubmitting,
}: {
  readonly actor: Actor<typeof practiceOverviewMachine>;
  readonly isBatchFinished: boolean;
  readonly isRevealed: boolean;
  readonly isStartingBatch: boolean;
  readonly isSubmitting: boolean;
}) {
  const completedBatch = useSelector(
    actor,
    (snapshot) => snapshot.context.completedBatch
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
  const batch = useSelector(actor, (snapshot) => snapshot.context.batch);
  const queue = useSelector(actor, (snapshot) => snapshot.context.queue);
  const currentItem = queue[0];
  const isShowingResult = isRevealed && lastResult !== undefined;
  const isShowingFinishedResult =
    isShowingResult && lastResult.batchCompleted !== undefined;
  const isShowingBatchFinished =
    (isBatchFinished || isStartingBatch) && completedBatch !== undefined;
  const ResultIcon = lastResult?.isCorrect === true ? CircleCheck : CircleX;
  const resultIconLabel =
    lastResult?.isCorrect === true ? "Correct" : "Incorrect";
  const resultIconColor =
    lastResult?.isCorrect === true ? "text-sky" : "text-berry";
  const batchProgressPercent =
    batch === undefined || batch.totalCount === 0
      ? 0
      : Math.round((batch.completedCount / batch.totalCount) * 100);

  if (
    currentItem === undefined &&
    !isShowingResult &&
    !isShowingBatchFinished
  ) {
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
        <Tooltip.Root>
          <Tooltip.Trigger
            render={
              <Button
                type="button"
                aria-label="Refresh batch"
                className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-ink-muted transition hover:bg-field hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky disabled:opacity-50"
                disabled={
                  isSubmitting ||
                  isShowingBatchFinished ||
                  isShowingFinishedResult
                }
                focusableWhenDisabled
                onClick={() => {
                  actor.trigger.refresh();
                }}
              />
            }
          >
            <RefreshCw size={16} strokeWidth={2.5} />
          </Tooltip.Trigger>
          <Tooltip.Portal>
            <Tooltip.Positioner sideOffset={8}>
              <Tooltip.Popup className="rounded-md border border-line bg-panel px-2 py-1 text-xs font-black text-ink shadow-[0_12px_35px_rgba(0,0,0,0.35)]">
                Refresh batch
              </Tooltip.Popup>
            </Tooltip.Positioner>
          </Tooltip.Portal>
        </Tooltip.Root>
        {batch === undefined ? null : (
          <Progress.Root
            className="grid min-w-0 flex-1 gap-2 text-left"
            value={batchProgressPercent}
            getAriaValueText={() =>
              `${batch.completedCount} of ${batch.totalCount} words complete`
            }
          >
            <div className="flex min-w-0 items-center justify-between gap-3 text-xs font-black uppercase text-ink-muted">
              <Progress.Label>Batch {batch.batchNumber}</Progress.Label>
              <Progress.Value className="shrink-0">
                {() => `${batch.completedCount} / ${batch.totalCount}`}
              </Progress.Value>
            </div>
            <Progress.Track className="h-1.5 overflow-hidden rounded-sm bg-field">
              <Progress.Indicator className="h-full rounded-sm bg-teal transition-[width]" />
            </Progress.Track>
          </Progress.Root>
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
          {isShowingBatchFinished ? (
            <div className="grid w-full justify-items-center gap-3">
              <h1 className="w-full wrap-break-word text-3xl font-black leading-tight sm:text-5xl">
                This batch is finished.
              </h1>
              <p className="w-full wrap-break-word text-base font-black leading-6 text-ink-muted sm:text-xl">
                Do you want to start the next?
              </p>
              <p className="w-full wrap-break-word text-sm font-bold leading-6 text-ink-muted">
                Batch {completedBatch.batchNumber} ·{" "}
                {completedBatch.correctCount}/{completedBatch.totalCount}{" "}
                correct
              </p>
            </div>
          ) : isShowingResult ? (
            <div className="grid w-full gap-3">
              <ResultIcon
                aria-label={resultIconLabel}
                className={`justify-self-center ${resultIconColor}`}
                role="img"
                size={34}
                strokeWidth={2.5}
              />
              <h1 className="w-full wrap-break-word text-4xl font-black leading-tight sm:text-7xl">
                <WordText text={lastResult.wordText} />
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
        {isShowingBatchFinished ? (
          <Button
            type="button"
            autoFocus
            className="inline-flex h-12 items-center justify-center gap-2 rounded-md bg-action px-4 text-sm font-black text-action-ink transition hover:bg-action-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky disabled:bg-field disabled:text-ink-muted"
            disabled={isStartingBatch}
            onClick={() => {
              actor.trigger.startNextBatch();
            }}
          >
            {isStartingBatch ? (
              <LoaderCircle
                aria-hidden="true"
                className="animate-spin"
                size={18}
                strokeWidth={2.5}
              />
            ) : (
              <ArrowRight aria-hidden="true" size={18} strokeWidth={2.5} />
            )}
            {isStartingBatch ? "Starting" : "Start next batch"}
          </Button>
        ) : isShowingResult ? (
          <Tooltip.Root>
            <Tooltip.Trigger
              render={
                <Button
                  type="button"
                  aria-label="Next"
                  autoFocus
                  className="inline-flex h-14 w-14 items-center justify-center rounded-md bg-action text-action-ink transition hover:bg-action-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky"
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
                actor.trigger.changeResponse({
                  response,
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
        <div className="min-h-12 text-sm font-bold leading-6 text-ink-muted">
          {isShowingBatchFinished ? (
            message === undefined ? null : (
              <span className="text-accent">{message}</span>
            )
          ) : message !== undefined ? (
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
