import { AlertDialog } from "@base-ui/react/alert-dialog";
import { Button } from "@base-ui/react/button";
import { Input } from "@base-ui/react/input";
import { Tooltip } from "@base-ui/react/tooltip";
import { PracticeOverviewMachine } from "@jip/machines";
import {
  FuriganaText,
  WordMemoryScheduler,
  WordPracticePresentation,
  WordPracticeStage,
} from "@jip/services";
import { Link, createFileRoute } from "@tanstack/react-router";
import { useMachine, useSelector } from "@xstate/react";
import { DateTime } from "effect";
import {
  ArrowLeft,
  Check,
  CircleCheck,
  CircleX,
  Lightbulb,
  LoaderCircle,
  RefreshCw,
} from "lucide-react";
import type { Actor } from "xstate";

import { WordText } from "../components/word-text.tsx";
import { formatReviewInterval } from "../lib/format.ts";
import { RuntimeClient } from "../lib/runtime-client.ts";

const practiceOverviewMachine =
  PracticeOverviewMachine.makePracticeOverviewMachine({
    runtime: RuntimeClient,
  });

const StageLabels = {
  recognition: "Recognition",
  meaningRecall: "Meaning recall",
  contextRecall: "Context recall",
} as const;

export const Route = createFileRoute("/practice")({
  component: PracticeRoute,
});

function PracticeRoute() {
  const [snapshot, , actor] = useMachine(practiceOverviewMachine);
  const isEmptyLibrary = snapshot.value === "EmptyLibrary";
  const isComplete = snapshot.value === "Complete";
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

  if (isComplete) {
    return (
      <section className="flex h-[calc(100svh-1.5rem-max(1rem,env(safe-area-inset-bottom)))] min-w-0 flex-col items-center gap-4 text-center sm:h-[calc(100svh-2.5rem-max(1.5rem,env(safe-area-inset-bottom)))]">
        <div className="flex flex-1 flex-col items-center justify-center gap-4">
          <CircleCheck className="text-teal" size={42} strokeWidth={2.5} />
          <div>
            <div className="text-xl font-black">Scheduled work complete</div>
            <div className="mt-1 text-sm font-semibold text-ink-muted">
              No reviews or new stages are due right now.
            </div>
          </div>
        </div>
        <div className="grid w-full shrink-0 gap-2">
          <Button
            type="button"
            className="inline-flex h-14 w-full items-center justify-center rounded-md bg-action px-4 text-sm font-black text-action-ink transition hover:bg-action-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky"
            onClick={() => {
              actor.trigger.refresh();
            }}
          >
            Check again
          </Button>
          <Link
            to="/"
            className="inline-flex h-14 w-full items-center justify-center rounded-md border border-line bg-panel px-4 text-sm font-black text-ink-muted transition hover:bg-field hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky"
          >
            Back
          </Link>
        </div>
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
  answer,
  template,
  revealed,
}: {
  readonly answer: string;
  readonly template: string;
  readonly revealed: boolean;
}) {
  const markerIndex = template.indexOf(WordPracticePresentation.WordMarker);
  const before = template.slice(0, markerIndex);
  const after = template.slice(
    markerIndex + WordPracticePresentation.WordMarker.length
  );

  return (
    <>
      <WordText text={before} />
      {!revealed ? (
        <span
          aria-label="Missing word"
          className="mx-1 inline-block min-w-16 border-b-2 border-current align-baseline"
        >
          &nbsp;
        </span>
      ) : (
        <span className="font-black text-sky">
          <WordText text={answer} />
        </span>
      )}
      <WordText text={after} />
    </>
  );
}

function PracticeExampleTranslation({
  target,
  template,
}: {
  readonly target: string;
  readonly template: string;
}) {
  const markerIndex = template.indexOf(
    WordPracticePresentation.TranslationTargetMarker
  );
  const before = template.slice(0, markerIndex);
  const after = template.slice(
    markerIndex + WordPracticePresentation.TranslationTargetMarker.length
  );

  return (
    <>
      {before}
      <span className="font-black text-gold">{target}</span>
      {after}
    </>
  );
}

function ConfirmRatingButton({
  buttonClassName,
  description,
  disabled,
  interval,
  label,
  onConfirm,
}: {
  readonly buttonClassName: string;
  readonly description: string;
  readonly disabled: boolean;
  readonly interval: string | undefined;
  readonly label: "Again" | "Easy";
  readonly onConfirm: () => void;
}) {
  return (
    <AlertDialog.Root>
      <AlertDialog.Trigger className={buttonClassName} disabled={disabled}>
        <span className="grid gap-0.5">
          <span>{label}</span>
          <span className="text-[0.65rem] opacity-75">{interval}</span>
        </span>
      </AlertDialog.Trigger>
      <AlertDialog.Portal>
        <AlertDialog.Backdrop className="fixed inset-0 z-40 bg-paper/70 backdrop-blur-sm" />
        <AlertDialog.Popup className="fixed left-1/2 top-1/2 z-50 grid w-[min(calc(100vw-2rem),28rem)] -translate-x-1/2 -translate-y-1/2 gap-5 rounded-md border border-line bg-panel p-5 text-left text-ink shadow-[0_24px_80px_rgba(0,0,0,0.45)] focus:outline-none">
          <div className="grid gap-2">
            <AlertDialog.Title className="text-lg font-black">
              Rate this word {label}?
            </AlertDialog.Title>
            <AlertDialog.Description className="text-sm font-semibold leading-6 text-ink-muted">
              {description}
            </AlertDialog.Description>
          </div>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <AlertDialog.Close className="h-10 rounded-md px-4 text-sm font-black text-ink-muted transition hover:bg-field hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky">
              Cancel
            </AlertDialog.Close>
            <AlertDialog.Close
              className="inline-flex h-10 items-center justify-center rounded-md bg-action px-4 text-sm font-black text-action-ink transition hover:bg-action-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky"
              onClick={onConfirm}
            >
              Confirm {label}
            </AlertDialog.Close>
          </div>
        </AlertDialog.Popup>
      </AlertDialog.Portal>
    </AlertDialog.Root>
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
  const answerVisible = useSelector(
    actor,
    (snapshot) => snapshot.context.answerVisible
  );
  const message = useSelector(actor, (snapshot) => snapshot.context.message);
  const isShowingResult = isRevealed && lastResult !== undefined;
  const practiceMode =
    currentItem === undefined ? undefined : currentItem.state.stage;
  const ratingNow = Date.now();
  const ratingCard: WordMemoryScheduler.WordMemoryCard | undefined =
    currentItem === undefined
      ? undefined
      : {
          difficulty: currentItem.state.difficulty,
          dueAtMillis: DateTime.toEpochMillis(currentItem.state.dueAt),
          elapsedDays: currentItem.state.elapsedDays,
          lapses: currentItem.state.lapses,
          ...(currentItem.state.lastReviewAt === undefined
            ? {}
            : {
                lastReviewAtMillis: DateTime.toEpochMillis(
                  currentItem.state.lastReviewAt
                ),
              }),
          learningSteps: currentItem.state.learningSteps,
          phase: currentItem.state.phase,
          repetitions: currentItem.state.repetitions,
          scheduledDays: currentItem.state.scheduledDays,
          stability: currentItem.state.stability,
        };
  const ratingPreviewInput =
    currentItem === undefined || ratingCard === undefined
      ? undefined
      : {
          card: ratingCard,
          now: ratingNow,
          stage: currentItem.state.stage,
          stageAttemptCount: currentItem.state.stageAttemptCount,
          stageFailureStreak: currentItem.state.stageFailureStreak,
          stageMasteryStreak: currentItem.state.stageMasteryStreak,
          stageStartedAtMillis: DateTime.toEpochMillis(
            currentItem.state.stageStartedAt
          ),
        };
  const againPreview =
    ratingPreviewInput === undefined
      ? undefined
      : WordPracticeStage.previewRating({
          ...ratingPreviewInput,
          rating: "again",
        });
  const hardPreview =
    ratingPreviewInput === undefined
      ? undefined
      : WordPracticeStage.previewRating({
          ...ratingPreviewInput,
          rating: "hard",
        });
  const goodPreview =
    ratingPreviewInput === undefined
      ? undefined
      : WordPracticeStage.previewRating({
          ...ratingPreviewInput,
          rating: "good",
        });
  const easyPreview =
    ratingPreviewInput === undefined
      ? undefined
      : WordPracticeStage.previewRating({
          ...ratingPreviewInput,
          rating: "easy",
        });
  const ratingIntervals = {
    again:
      againPreview === undefined
        ? undefined
        : againPreview.promotedTo === undefined
          ? againPreview.demotedTo === undefined
            ? formatReviewInterval({
                dueAt: againPreview.card.dueAtMillis,
                now: ratingNow,
              })
            : "previous stage"
          : "next stage",
    hard:
      hardPreview === undefined
        ? undefined
        : hardPreview.promotedTo === undefined
          ? hardPreview.demotedTo === undefined
            ? formatReviewInterval({
                dueAt: hardPreview.card.dueAtMillis,
                now: ratingNow,
              })
            : "previous stage"
          : "next stage",
    good:
      goodPreview === undefined
        ? undefined
        : goodPreview.promotedTo === undefined
          ? goodPreview.demotedTo === undefined
            ? formatReviewInterval({
                dueAt: goodPreview.card.dueAtMillis,
                now: ratingNow,
              })
            : "previous stage"
          : "next stage",
    easy:
      easyPreview === undefined
        ? undefined
        : easyPreview.promotedTo === undefined
          ? easyPreview.demotedTo === undefined
            ? formatReviewInterval({
                dueAt: easyPreview.card.dueAtMillis,
                now: ratingNow,
              })
            : "previous stage"
          : "next stage",
  };
  const ResultIcon = lastResult?.isCorrect === true ? CircleCheck : CircleX;

  return (
    <section className="relative h-[calc(100svh-1.5rem-max(1rem,env(safe-area-inset-bottom)))] min-h-0 min-w-0 overflow-hidden sm:h-[calc(100svh-2.5rem-max(1.5rem,env(safe-area-inset-bottom)))]">
      <Link
        to="/"
        aria-label="Back"
        className="absolute left-0 top-0 z-10 inline-flex h-9 w-9 items-center justify-center rounded-md text-ink-muted transition hover:bg-field hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky sm:top-2"
      >
        <ArrowLeft aria-hidden="true" size={18} strokeWidth={2.5} />
      </Link>
      <form
        className="mx-auto flex h-full min-h-0 w-full max-w-xl min-w-0 flex-col items-start gap-3 overflow-hidden pt-10 text-center sm:gap-5 sm:pt-0"
        onSubmit={(event) => {
          event.preventDefault();

          if (practiceMode === "contextRecall") {
            actor.trigger.submit();
          }
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
              {lastResult.promotedTo === undefined ? null : (
                <p className="text-sm font-black text-teal">
                  {StageLabels[lastResult.stage]} mastered ·{" "}
                  {StageLabels[lastResult.promotedTo]} begins tomorrow
                </p>
              )}
              {lastResult.demotedTo === undefined ? null : (
                <p className="text-sm font-black text-gold">
                  Returning to {StageLabels[lastResult.demotedTo]} tomorrow
                </p>
              )}
              {lastResult.example === undefined ? (
                <h1 className="w-full wrap-break-word text-4xl font-black leading-tight sm:text-7xl">
                  <WordText text={lastResult.word.text} />
                </h1>
              ) : (
                <h1 className="w-full wrap-break-word text-xl font-normal leading-relaxed sm:text-3xl">
                  <PracticeExampleSentence
                    answer={lastResult.example.answer}
                    template={lastResult.example.template}
                    revealed
                  />
                </h1>
              )}
              <p className="w-full wrap-break-word text-lg font-normal leading-tight text-ink-muted sm:text-2xl">
                {lastResult.word.translation}
              </p>
              {lastResult.example === undefined ? null : (
                <p className="w-full wrap-break-word text-sm font-semibold leading-6 text-ink-muted sm:text-base">
                  <PracticeExampleTranslation
                    target={lastResult.example.translationTarget}
                    template={lastResult.example.translationTemplate}
                  />
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
          ) : currentItem === undefined ? null : answerVisible ? (
            <div className="grid w-full gap-3">
              <h1 className="w-full wrap-break-word text-4xl font-black leading-tight sm:text-7xl">
                <WordText text={currentItem.word.text} />
              </h1>
              <p className="w-full wrap-break-word text-lg font-normal leading-tight text-ink-muted sm:text-2xl">
                {currentItem.word.translation}
              </p>
              {currentItem.word.description === undefined ? null : (
                <p className="max-w-lg justify-self-center text-sm font-semibold leading-6 text-ink-muted">
                  {currentItem.word.description}
                </p>
              )}
              {currentItem.example === undefined ? null : (
                <div className="mt-2 grid gap-2">
                  <p className="w-full wrap-break-word text-xl font-normal leading-relaxed sm:text-3xl">
                    <PracticeExampleSentence
                      answer={currentItem.example.answer}
                      template={currentItem.example.template}
                      revealed
                    />
                  </p>
                  <p className="w-full wrap-break-word text-sm font-semibold leading-6 text-ink-muted sm:text-base">
                    <PracticeExampleTranslation
                      target={currentItem.example.translationTarget}
                      template={currentItem.example.translationTemplate}
                    />
                  </p>
                </div>
              )}
            </div>
          ) : practiceMode === "recognition" ? (
            <div className="grid w-full gap-3">
              <div className="text-xs font-black uppercase tracking-widest text-sky">
                Recognition
              </div>
              <h1 className="w-full wrap-break-word text-4xl font-black leading-tight sm:text-7xl">
                {FuriganaText.toPlainText({ text: currentItem.word.text })}
              </h1>
              <p className="text-sm font-semibold text-ink-muted">
                Recall the reading and meaning
              </p>
            </div>
          ) : practiceMode === "meaningRecall" ? (
            <div className="grid w-full gap-3">
              <div className="text-xs font-black uppercase tracking-widest text-gold">
                Meaning recall
              </div>
              <h1 className="w-full wrap-break-word text-2xl font-normal leading-tight sm:text-4xl">
                {currentItem.word.translation}
              </h1>
              {currentItem.word.description === undefined ? null : (
                <p className="w-full wrap-break-word text-sm font-semibold leading-6 text-ink-muted sm:text-base">
                  {currentItem.word.description}
                </p>
              )}
            </div>
          ) : (
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
                      answer={currentItem.example.answer}
                      template={currentItem.example.template}
                      revealed={false}
                    />
                  </h1>
                  <p className="w-full wrap-break-word text-sm font-semibold leading-6 text-ink-muted sm:text-base">
                    <PracticeExampleTranslation
                      target={currentItem.example.translationTarget}
                      template={currentItem.example.translationTemplate}
                    />
                  </p>
                  {hintVisible ? (
                    <p
                      aria-live="polite"
                      className="w-full wrap-break-word text-sm font-semibold leading-6 text-ink-muted"
                    >
                      {currentItem.word.description}
                    </p>
                  ) : null}
                </>
              )}
            </div>
          )}
        </div>
        <div className="grid w-full justify-items-center gap-1 text-center text-xs font-normal leading-5 text-ink-muted">
          {message === undefined ? null : (
            <span className="font-bold text-accent">{message}</span>
          )}
        </div>
        {practiceMode !== "contextRecall" && !answerVisible ? (
          <Button
            type="button"
            autoFocus
            className="mt-auto inline-flex h-14 min-h-14 w-full shrink-0 items-center justify-center self-center rounded-md bg-action px-6 text-sm font-black text-action-ink transition hover:bg-action-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky disabled:opacity-60"
            disabled={isSubmitting}
            onClick={() => {
              actor.trigger.reveal();
            }}
          >
            Reveal
          </Button>
        ) : answerVisible ? (
          <div className="mt-auto grid w-full shrink-0 grid-cols-2 gap-2 sm:grid-cols-4">
            <ConfirmRatingButton
              buttonClassName="inline-flex h-14 min-h-14 items-center justify-center rounded-md border border-rating-again bg-panel px-4 text-sm font-black text-rating-again transition hover:bg-field focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rating-again disabled:opacity-60"
              description="Again resets acquisition progress or, after repeated context failures, returns the word to meaning recall."
              disabled={isSubmitting}
              interval={ratingIntervals?.again}
              label="Again"
              onConfirm={() => {
                actor.trigger.rateAgain();
              }}
            />
            <Button
              type="button"
              className="inline-flex h-14 min-h-14 items-center justify-center rounded-md border border-rating-hard bg-panel px-4 text-sm font-black text-rating-hard transition hover:bg-field focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rating-hard disabled:opacity-60"
              disabled={isSubmitting}
              onClick={() => {
                actor.trigger.rateHard();
              }}
            >
              <span className="grid gap-0.5">
                <span>Hard</span>
                <span className="text-[0.65rem] opacity-75">
                  {ratingIntervals?.hard}
                </span>
              </span>
            </Button>
            <Button
              type="button"
              autoFocus
              className="inline-flex h-14 min-h-14 items-center justify-center rounded-md border border-rating-good bg-panel px-4 text-sm font-black text-rating-good transition hover:bg-field focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rating-good disabled:opacity-60"
              disabled={isSubmitting}
              onClick={() => {
                actor.trigger.rateGood();
              }}
            >
              <span className="grid gap-0.5">
                <span>Good</span>
                <span className="text-[0.65rem] opacity-75">
                  {ratingIntervals?.good}
                </span>
              </span>
            </Button>
            <ConfirmRatingButton
              buttonClassName="inline-flex h-14 min-h-14 items-center justify-center rounded-md border border-rating-easy bg-panel px-4 text-sm font-black text-rating-easy transition hover:bg-field focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rating-easy disabled:opacity-60"
              description="Easy immediately masters an acquisition stage; in context recall it uses the normal FSRS interval."
              disabled={isSubmitting}
              interval={ratingIntervals?.easy}
              label="Easy"
              onConfirm={() => {
                actor.trigger.rateEasy();
              }}
            />
          </div>
        ) : (
          <div className="mt-auto flex w-full min-w-0 shrink-0 gap-2">
            {currentItem?.example === undefined ||
            currentItem.word.description === undefined ||
            hintVisible ? null : (
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
      </form>
    </section>
  );
}
