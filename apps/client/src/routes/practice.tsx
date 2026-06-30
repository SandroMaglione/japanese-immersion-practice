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

import { formatDateTime } from "../lib/format.ts";
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
  const isPracticeSubmitting = snapshot.matches("Submitting");

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
      {isPracticeReady || isPracticeRevealed || isPracticeSubmitting ? (
        <PracticeSession
          actor={actor}
          isRevealed={isPracticeRevealed}
          isSubmitting={isPracticeSubmitting}
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
  const queue = useSelector(actor, (snapshot) => snapshot.context.queue);
  const currentItem = queue[0];
  const isShowingResult = isRevealed && lastResult !== undefined;
  const ResultIcon =
    lastResult?.isCorrect === true ? CircleCheck : CircleX;
  const resultIconLabel =
    lastResult?.isCorrect === true ? "Correct" : "Incorrect";
  const resultIconColor =
    lastResult?.isCorrect === true ? "text-sky" : "text-berry";

  if (currentItem === undefined && !isShowingResult) {
    return (
      <section className="flex min-h-[calc(100vh-12rem)] flex-col justify-center gap-4 py-6 text-center sm:items-center">
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
    <section className="relative flex min-h-[calc(100vh-12rem)] flex-col justify-center py-6">
      <button
        type="button"
        aria-label="Refresh"
        title="Refresh"
        className="absolute right-0 top-0 inline-flex h-10 w-10 items-center justify-center rounded-md text-ink-muted transition hover:bg-field hover:text-ink"
        disabled={isSubmitting}
        onClick={() => {
          actor.trigger.refresh();
        }}
      >
        <RefreshCw size={16} strokeWidth={2.5} />
      </button>
      <form
        className="mx-auto flex w-full max-w-xl flex-col items-center gap-8 text-center"
        onSubmit={(event) => {
          event.preventDefault();
          actor.trigger.submit();
        }}
      >
        <div className="flex min-h-48 w-full flex-col items-center justify-center gap-3">
          {isShowingResult ? (
            <div className="grid w-full gap-3">
              <ResultIcon
                aria-label={resultIconLabel}
                className={`justify-self-center ${resultIconColor}`}
                role="img"
                size={34}
                strokeWidth={2.5}
              />
              <h1 className="w-full wrap-break-word text-5xl font-black leading-tight sm:text-7xl">
                <KanjiWordText
                  kanjiEntries={kanjiEntries}
                  text={lastResult.wordText}
                />
              </h1>
              <p className="w-full wrap-break-word text-xl font-black leading-tight text-ink-muted sm:text-2xl">
                {lastResult.wordTranslation}
              </p>
              {lastResult.wordDescription === undefined ? null : (
                <p className="max-w-lg justify-self-center text-sm font-semibold leading-6 text-ink-muted">
                  {lastResult.wordDescription}
                </p>
              )}
            </div>
          ) : currentItem === undefined ? null : (
            <div className="grid w-full gap-3">
              <h1 className="w-full wrap-break-word text-3xl font-black leading-tight sm:text-4xl">
                {currentItem.word.translation}
              </h1>
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
          <div className="flex w-full gap-2">
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
            <span>
              <span
                className={lastResult.isCorrect ? "text-teal" : "text-accent"}
              >
                {lastResult.isCorrect ? "Correct" : "Again soon"}
              </span>
              <span className="text-ink-muted">
                {" "}
                · {formatDateTime({ dateTime: lastResult.nextReviewAt })}
              </span>
            </span>
          ) : null}
        </div>
      </form>
    </section>
  );
}
