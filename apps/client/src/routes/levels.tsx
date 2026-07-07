import { Button } from "@base-ui/react/button";
import { Tabs } from "@base-ui/react/tabs";
import { WordPracticeLevelsMachine } from "@jip/machines";
import { createFileRoute } from "@tanstack/react-router";
import { useMachine, useSelector } from "@xstate/react";
import { Array as EffectArray, DateTime } from "effect";
import { RefreshCw } from "lucide-react";
import type { Actor } from "xstate";

import { WordText } from "../components/word-text.tsx";
import { formatDateTime } from "../lib/format.ts";
import { RuntimeClient } from "../lib/runtime-client.ts";

const wordPracticeLevelsMachine =
  WordPracticeLevelsMachine.makeWordPracticeLevelsMachine({
    runtime: RuntimeClient,
  });

const MillisecondsPerMinute = 60 * 1000;
const MillisecondsPerHour = 60 * MillisecondsPerMinute;
const MillisecondsPerDay = 24 * MillisecondsPerHour;

type WordPracticeLevelsActor = Actor<typeof wordPracticeLevelsMachine>;
type WordPracticeLevel = ReturnType<
  WordPracticeLevelsActor["getSnapshot"]
>["context"]["levels"][number];

export const Route = createFileRoute("/levels")({
  component: WordPracticeLevelsRoute,
});

function WordPracticeLevelsRoute() {
  const [snapshot, , actor] = useMachine(wordPracticeLevelsMachine);

  return (
    <div className="flex min-w-0 flex-col gap-6">
      {snapshot.matches("Loading") ? (
        <div className="py-10 text-center text-sm font-bold text-ink-muted">
          Loading review levels
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
      {snapshot.matches("Ready") ? (
        <WordPracticeLevelsTabs actor={actor} />
      ) : null}
    </div>
  );
}

function WordPracticeLevelsTabs({
  actor,
}: {
  readonly actor: WordPracticeLevelsActor;
}) {
  const levels = useSelector(actor, (snapshot) => snapshot.context.levels);
  const selectedLevel = useSelector(
    actor,
    (snapshot) => snapshot.context.selectedLevel
  );

  return (
    <Tabs.Root
      className="flex min-w-0 flex-col gap-4"
      value={`${selectedLevel}`}
      onValueChange={(value) => {
        const level = Number(value);

        if (!levels.some((levelGroup) => levelGroup.level === level)) {
          return;
        }

        actor.trigger.selectLevel({ level });
      }}
    >
      <Tabs.List
        aria-label="Review levels"
        className="flex w-full min-w-0 overflow-x-auto rounded-md border border-line bg-panel p-1"
      >
        {levels.map((level) => (
          <Tabs.Tab
            key={level.level}
            value={`${level.level}`}
            className={({ active }: { readonly active: boolean }) =>
              `inline-flex h-10 min-w-20 shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-md px-3 text-sm font-black transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky sm:min-w-0 sm:flex-1 sm:basis-0 ${
                active
                  ? "bg-action text-action-ink hover:bg-action-hover"
                  : "text-ink-muted hover:bg-field hover:text-ink"
              }`
            }
          >
            <span>Lv {level.level}</span>
            <span className="shrink-0 rounded-sm border border-current px-1.5 py-0.5 text-[0.7rem] leading-none text-inherit">
              {level.words.length}
            </span>
          </Tabs.Tab>
        ))}
      </Tabs.List>
      {levels.map((level) => (
        <Tabs.Panel key={level.level} value={`${level.level}`}>
          <WordPracticeLevelPanel level={level} />
        </Tabs.Panel>
      ))}
    </Tabs.Root>
  );
}

function WordPracticeLevelPanel({
  level,
}: {
  readonly level: WordPracticeLevel;
}) {
  if (!EffectArray.isReadonlyArrayNonEmpty(level.words)) {
    return (
      <div className="py-14 text-center">
        <div className="text-lg font-black">No words at this level</div>
        <div className="mt-2 text-sm font-semibold text-ink-muted">
          Level {level.level} needs {level.correctSubmissionTarget} correct
          answers to advance.
        </div>
      </div>
    );
  }

  return (
    <section className="divide-y divide-line">
      {level.words.map((word) => (
        <WordPracticeLevelRow key={word.word.text} word={word} />
      ))}
    </section>
  );
}

function WordPracticeLevelRow({
  word,
}: {
  readonly word: WordPracticeLevel["words"][number];
}) {
  const isPaused = word.nextReviewAt !== undefined && !word.isDue;
  const remainingMillis =
    word.nextReviewAt === undefined
      ? undefined
      : DateTime.toEpochMillis(word.nextReviewAt) - Date.now();
  const remainingDuration =
    remainingMillis === undefined
      ? undefined
      : remainingMillis <= 0
        ? "now"
        : remainingMillis < MillisecondsPerMinute
          ? "<1m left"
          : remainingMillis < MillisecondsPerHour
            ? `${Math.ceil(remainingMillis / MillisecondsPerMinute)}m left`
            : remainingMillis < MillisecondsPerDay
              ? `${Math.ceil(remainingMillis / MillisecondsPerHour)}h left`
              : `${Math.ceil(remainingMillis / MillisecondsPerDay)}d left`;

  return (
    <article className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-start gap-3 px-3 py-4 sm:items-center sm:gap-4">
      <span className="min-w-0 wrap-break-word text-xl font-black leading-tight">
        <WordText text={word.word.text} />
      </span>
      <div className="min-w-0 justify-self-end text-right">
        <p className="whitespace-nowrap text-sm font-black text-ink">
          {word.reviewProgress} / {word.reviewProgressTarget}
        </p>
        {isPaused ? (
          <p className="mt-1 max-w-[44vw] wrap-break-word text-xs font-bold leading-5 text-ink-muted sm:max-w-64">
            Next {formatDateTime({ dateTime: word.nextReviewAt })} ·{" "}
            {remainingDuration}
          </p>
        ) : null}
      </div>
    </article>
  );
}
