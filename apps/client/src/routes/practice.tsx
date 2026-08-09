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
  ArrowRight,
  Check,
  CircleCheck,
  CircleX,
  Eye,
  Lightbulb,
  LoaderCircle,
  RefreshCw,
} from "lucide-react";
import type { Actor } from "xstate";

import { WordText } from "../components/word-text.tsx";
import { formatDateTime, formatReviewInterval } from "../lib/format.ts";
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
  const isSubmitting =
    snapshot.value === "Submitting" ||
    snapshot.value === "RecordingIntroduction";

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
      <section className="flex min-w-0 flex-col items-center justify-center gap-4 py-14 text-center sm:min-h-[calc(100svh-12rem)] sm:py-6">
        <CircleCheck className="text-teal" size={42} strokeWidth={2.5} />
        <div>
          <div className="text-xl font-black">Scheduled work complete</div>
          <div className="mt-1 text-sm font-semibold text-ink-muted">
            No reviews or new stages are due right now.
          </div>
        </div>
        <Button
          type="button"
          className="inline-flex h-10 items-center gap-2 rounded-md border border-line bg-panel px-4 text-sm font-black text-ink-muted transition hover:text-ink"
          onClick={() => {
            actor.trigger.refresh();
          }}
        >
          <RefreshCw size={16} strokeWidth={2.5} />
          Check again
        </Button>
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
  const stats = useSelector(actor, (snapshot) => snapshot.context.stats);
  const isShowingResult = isRevealed && lastResult !== undefined;
  const practiceMode =
    currentItem === undefined
      ? undefined
      : currentItem.state.introducedAt === undefined
        ? "introduction"
        : currentItem.state.stage;
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
          hasExamples: (currentItem.word.examples?.length ?? 0) > 0,
          ...(ratingCard.lastReviewAtMillis === undefined
            ? {}
            : { lastReviewAtMillis: ratingCard.lastReviewAtMillis }),
          now: ratingNow,
          stage: currentItem.state.stage,
          stageAttemptCount: currentItem.state.stageAttemptCount,
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
          ? formatReviewInterval({
              dueAt: againPreview.card.dueAtMillis,
              now: ratingNow,
            })
          : "next stage",
    hard:
      hardPreview === undefined
        ? undefined
        : hardPreview.promotedTo === undefined
          ? formatReviewInterval({
              dueAt: hardPreview.card.dueAtMillis,
              now: ratingNow,
            })
          : "next stage",
    good:
      goodPreview === undefined
        ? undefined
        : goodPreview.promotedTo === undefined
          ? formatReviewInterval({
              dueAt: goodPreview.card.dueAtMillis,
              now: ratingNow,
            })
          : "next stage",
    easy:
      easyPreview === undefined
        ? undefined
        : easyPreview.promotedTo === undefined
          ? formatReviewInterval({
              dueAt: easyPreview.card.dueAtMillis,
              now: ratingNow,
            })
          : "next stage",
  };
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
          ) : currentItem === undefined ? null : practiceMode ===
            "introduction" ? (
            <div className="grid w-full gap-3">
              <div className="text-xs font-black uppercase tracking-widest text-sky">
                Meet this word
              </div>
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
          ) : answerVisible ? (
            <div className="grid w-full gap-3">
              <div className="text-xs font-black uppercase tracking-widest text-teal">
                Answer
              </div>
              <h1 className="w-full wrap-break-word text-4xl font-black leading-tight sm:text-7xl">
                <WordText text={currentItem.word.text} />
              </h1>
              <p className="w-full wrap-break-word text-lg font-normal leading-tight text-ink-muted sm:text-2xl">
                {currentItem.word.translation}
              </p>
              <p className="text-base font-black tracking-wide text-gold sm:text-xl">
                {FuriganaText.toReadingText({ text: currentItem.word.text })}
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
        {isShowingResult ? (
          <Tooltip.Root>
            <Tooltip.Trigger
              render={
                <Button
                  type="button"
                  aria-label="Next"
                  autoFocus
                  className="mt-auto inline-flex h-14 w-14 items-center justify-center self-center rounded-md bg-action text-action-ink transition hover:bg-action-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky"
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
        ) : practiceMode === "introduction" ? (
          <Button
            type="button"
            autoFocus
            className="mt-auto inline-flex h-14 items-center justify-center gap-2 self-center rounded-md bg-action px-6 text-sm font-black text-action-ink transition hover:bg-action-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky disabled:opacity-60"
            disabled={isSubmitting}
            onClick={() => {
              actor.trigger.introduce();
            }}
          >
            I’ve seen it
            <ArrowRight aria-hidden="true" size={18} strokeWidth={2.5} />
          </Button>
        ) : practiceMode !== "contextRecall" && !answerVisible ? (
          <Button
            type="button"
            autoFocus
            className="mt-auto inline-flex h-14 items-center justify-center gap-2 self-center rounded-md bg-action px-6 text-sm font-black text-action-ink transition hover:bg-action-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky disabled:opacity-60"
            disabled={isSubmitting}
            onClick={() => {
              actor.trigger.reveal();
            }}
          >
            <Eye aria-hidden="true" size={18} strokeWidth={2.5} />
            Reveal
          </Button>
        ) : answerVisible ? (
          <div className="mt-auto grid w-full grid-cols-2 gap-2 sm:grid-cols-4">
            <Button
              type="button"
              className="inline-flex h-14 items-center justify-center rounded-md border border-rating-again bg-panel px-4 text-sm font-black text-rating-again transition hover:bg-field focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rating-again disabled:opacity-60"
              disabled={isSubmitting}
              onClick={() => {
                actor.trigger.rateAgain();
              }}
            >
              <span className="grid gap-0.5">
                <span>Again</span>
                <span className="text-[0.65rem] opacity-75">
                  {ratingIntervals?.again}
                </span>
              </span>
            </Button>
            <Button
              type="button"
              className="inline-flex h-14 items-center justify-center rounded-md border border-rating-hard bg-panel px-4 text-sm font-black text-rating-hard transition hover:bg-field focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rating-hard disabled:opacity-60"
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
              className="inline-flex h-14 items-center justify-center rounded-md border border-rating-good bg-panel px-4 text-sm font-black text-rating-good transition hover:bg-field focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rating-good disabled:opacity-60"
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
            <Button
              type="button"
              className="inline-flex h-14 items-center justify-center rounded-md border border-rating-easy bg-panel px-4 text-sm font-black text-rating-easy transition hover:bg-field focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rating-easy disabled:opacity-60"
              disabled={isSubmitting}
              onClick={() => {
                actor.trigger.rateEasy();
              }}
            >
              <span className="grid gap-0.5">
                <span>Easy</span>
                <span className="text-[0.65rem] opacity-75">
                  {ratingIntervals?.easy}
                </span>
              </span>
            </Button>
          </div>
        ) : (
          <div className="mt-auto flex w-full min-w-0 gap-2">
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
