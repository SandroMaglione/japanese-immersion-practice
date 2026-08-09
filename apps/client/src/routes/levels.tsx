import { Button } from "@base-ui/react/button";
import { Tabs } from "@base-ui/react/tabs";
import { WordMemoryMachine } from "@jip/machines";
import { createFileRoute } from "@tanstack/react-router";
import { useMachine, useSelector } from "@xstate/react";
import { Array as EffectArray, DateTime } from "effect";
import { AlarmClock, CalendarClock, RefreshCw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { Actor } from "xstate";

import { WordText } from "../components/word-text.tsx";
import { formatReviewInterval } from "../lib/format.ts";
import { RuntimeClient } from "../lib/runtime-client.ts";

const wordMemoryMachine = WordMemoryMachine.makeWordMemoryMachine({
  runtime: RuntimeClient,
});

type WordMemoryActor = Actor<typeof wordMemoryMachine>;
type WordMemoryGroup = ReturnType<
  WordMemoryActor["getSnapshot"]
>["context"]["groups"][number];

const StatusLabels = {
  due: "Due",
  later: "Later",
} as const;

const StageLabels = {
  recognition: "Recognition",
  meaningRecall: "Meaning recall",
  contextRecall: "Context recall",
} as const;

const StatusPresentation = {
  due: {
    activeClassName: "border-gold/55 bg-gold-soft text-gold",
    Icon: AlarmClock,
  },
  later: {
    activeClassName: "border-line bg-field text-ink",
    Icon: CalendarClock,
  },
} as const;

const WordPageSize = 100;

export const Route = createFileRoute("/levels")({
  component: WordMemoryRoute,
});

function WordMemoryRoute() {
  const [snapshot, , actor] = useMachine(wordMemoryMachine);
  const showMemory = snapshot.value === "Ready";

  return (
    <div className="flex min-w-0 flex-col gap-6">
      {snapshot.matches("Loading") ? (
        <div className="py-10 text-center text-sm font-bold text-ink-muted">
          Loading word memory
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
      {showMemory ? (
        <>
          <WordMemoryTabs actor={actor} />
        </>
      ) : null}
    </div>
  );
}

function WordMemoryTabs({ actor }: { readonly actor: WordMemoryActor }) {
  const groups = useSelector(actor, (snapshot) => snapshot.context.groups);
  const message = useSelector(actor, (snapshot) => snapshot.context.message);
  const notice = useSelector(actor, (snapshot) => snapshot.context.notice);
  const selectedStatus = useSelector(
    actor,
    (snapshot) => snapshot.context.selectedStatus
  );

  return (
    <Tabs.Root
      className="flex min-w-0 flex-col gap-4"
      value={selectedStatus}
      onValueChange={(value) => {
        const group = groups.find((candidate) => candidate.status === value);

        if (group !== undefined) {
          actor.trigger.selectStatus({ status: group.status });
        }
      }}
    >
      <Tabs.List
        aria-label="Review availability"
        className="grid w-full min-w-0 grid-cols-2 gap-2"
      >
        {groups.map((group) => {
          const presentation = StatusPresentation[group.status];
          const StatusIcon = presentation.Icon;

          return (
            <Tabs.Tab
              key={group.status}
              value={group.status}
              aria-label={`${StatusLabels[group.status]}, ${group.words.length} words`}
              className={({ active }: { readonly active: boolean }) =>
                `grid h-[5.25rem] min-w-[6.75rem] shrink-0 snap-start scroll-mx-8 grid-cols-[auto_minmax(0,1fr)] grid-rows-[1fr_auto] items-center gap-x-2 rounded-xl border p-3 text-left shadow-[0_10px_28px_rgba(0,0,0,0.14)] transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky sm:min-w-0 ${active ? presentation.activeClassName : "border-line/80 bg-panel text-ink-muted hover:border-ink-muted/50 hover:bg-field hover:text-ink"}`
              }
            >
              <StatusIcon
                aria-hidden="true"
                className="row-span-2 self-center"
                size={20}
                strokeWidth={2.25}
              />
              <strong className="justify-self-end text-2xl font-black tabular-nums leading-none">
                {group.words.length}
              </strong>
              <span className="justify-self-end text-[0.65rem] font-black uppercase tracking-[0.12em] opacity-80">
                {StatusLabels[group.status]}
              </span>
            </Tabs.Tab>
          );
        })}
      </Tabs.List>
      <div className="flex flex-col gap-3">
        <div className="min-w-0">
          {notice === undefined ? null : (
            <p className="text-sm font-black text-teal">{notice}</p>
          )}
          {message === undefined ? null : (
            <p className="text-sm font-black text-accent">{message}</p>
          )}
        </div>
      </div>
      {groups.map((group) => (
        <Tabs.Panel key={group.status} value={group.status}>
          <WordMemoryPanel group={group} />
        </Tabs.Panel>
      ))}
    </Tabs.Root>
  );
}

function WordMemoryPanel({ group }: { readonly group: WordMemoryGroup }) {
  const [visibleWordCount, setVisibleWordCount] = useState(WordPageSize);
  const loadMoreSentinelRef = useRef<HTMLDivElement>(null);
  const hasMoreWords = visibleWordCount < group.words.length;

  useEffect(() => {
    const sentinel = loadMoreSentinelRef.current;

    if (!hasMoreWords || sentinel === null) {
      return;
    }

    if (window.IntersectionObserver === undefined) {
      setVisibleWordCount(group.words.length);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting === true) {
          setVisibleWordCount((count) =>
            Math.min(count + WordPageSize, group.words.length)
          );
        }
      },
      { rootMargin: "240px 0px" }
    );

    observer.observe(sentinel);

    return () => {
      observer.disconnect();
    };
  }, [group.words.length, hasMoreWords]);

  if (!EffectArray.isReadonlyArrayNonEmpty(group.words)) {
    return (
      <div className="py-14 text-center">
        <div className="text-lg font-black">
          No {StatusLabels[group.status].toLocaleLowerCase()} words
        </div>
        <div className="mt-2 text-sm font-semibold text-ink-muted">
          Memory status updates continuously as you practice.
        </div>
      </div>
    );
  }

  const visibleWords = group.words.slice(0, visibleWordCount);

  return (
    <div>
      <section className="divide-y divide-line">
        {visibleWords.map((word) => (
          <WordMemoryRow key={word.word.id} word={word} />
        ))}
      </section>
      {hasMoreWords ? (
        <div
          ref={loadMoreSentinelRef}
          aria-hidden="true"
          className="h-px w-full"
        />
      ) : null}
    </div>
  );
}

function WordMemoryRow({
  word,
}: {
  readonly word: WordMemoryGroup["words"][number];
}) {
  const reviewInterval = formatReviewInterval({
    dueAt: DateTime.toEpochMillis(word.state.dueAt),
    now: Date.now(),
  });
  const retention = Math.round(word.retrievability * 100);
  const stability =
    word.state.stability < 1
      ? `${Math.max(1, Math.round(word.state.stability * 24))}h stability`
      : `${Math.round(word.state.stability)}d stability`;

  return (
    <article className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-4 px-3 py-4">
      <div className="min-w-0">
        <span className="wrap-break-word text-xl font-black leading-tight">
          <WordText text={word.word.text} />
        </span>
        <p className="mt-1 text-xs font-black text-sky">
          {StageLabels[word.state.stage]}
        </p>
      </div>
      <div className="grid min-w-0 justify-items-end gap-1 justify-self-end text-right">
        <p className="whitespace-nowrap text-sm font-normal text-ink">
          {word.isDue ? "Due now" : `Review in ${reviewInterval}`}
        </p>
        <p className="text-xs font-normal leading-5 text-ink-muted">
          {stability}
        </p>
        <p className="text-xs font-normal leading-5 text-ink-muted">
          {retention}% recall
        </p>
      </div>
    </article>
  );
}
