import { AlertDialog } from "@base-ui/react/alert-dialog";
import { Button } from "@base-ui/react/button";
import { Tabs } from "@base-ui/react/tabs";
import { WordMemoryMachine } from "@jip/machines";
import { createFileRoute } from "@tanstack/react-router";
import { useMachine, useSelector } from "@xstate/react";
import { Array as EffectArray } from "effect";
import {
  AlarmClock,
  CalendarClock,
  Check,
  LoaderCircle,
  RefreshCw,
  RotateCcw,
  Sparkles,
  Sprout,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { Actor } from "xstate";

import { WordText } from "../components/word-text.tsx";
import { formatDateTime } from "../lib/format.ts";
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
  learning: "Learning",
  new: "New",
  relearning: "Relearning",
  scheduled: "Scheduled",
} as const;

const StatusPresentation = {
  due: {
    activeClassName: "border-gold/55 bg-gold-soft text-gold",
    Icon: AlarmClock,
  },
  learning: {
    activeClassName: "border-teal/50 bg-teal-soft text-teal",
    Icon: Sprout,
  },
  new: {
    activeClassName: "border-sky/45 bg-sky/10 text-sky",
    Icon: Sparkles,
  },
  relearning: {
    activeClassName: "border-accent/50 bg-accent-soft text-accent",
    Icon: RotateCcw,
  },
  scheduled: {
    activeClassName: "border-line bg-field text-ink",
    Icon: CalendarClock,
  },
} as const;

const WordPageSize = 100;
const dialogBackdropClassName = "fixed inset-0 bg-paper/70 backdrop-blur-sm";
const dialogPopupClassName =
  "fixed left-1/2 top-1/2 grid w-[min(calc(100vw-1rem),36rem)] -translate-x-1/2 -translate-y-1/2 gap-5 rounded-md border border-line bg-panel p-5 text-ink shadow-[0_24px_80px_rgba(0,0,0,0.45)] focus:outline-none";
const quietButtonClassName =
  "h-10 rounded-md px-4 text-sm font-black text-ink-muted transition hover:bg-field hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky disabled:opacity-50";
const primaryButtonClassName =
  "inline-flex h-10 items-center justify-center gap-2 rounded-md bg-action px-4 text-sm font-black text-action-ink transition hover:bg-action-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky disabled:opacity-50";
const secondaryButtonClassName =
  "inline-flex h-10 items-center justify-center gap-2 rounded-md border border-line bg-panel px-4 text-sm font-black text-ink-muted transition hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky disabled:opacity-50";

export const Route = createFileRoute("/levels")({
  component: WordMemoryRoute,
});

function WordMemoryRoute() {
  const [snapshot, , actor] = useMachine(wordMemoryMachine);
  const recalculationActive =
    snapshot.value === "CalculatingRecalculationPreview" ||
    snapshot.value === "ConfirmingRecalculation" ||
    snapshot.value === "ApplyingRecalculation";
  const showMemory = snapshot.value === "Ready" || recalculationActive;

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
          <WordMemoryRecalculationDialog actor={actor} />
        </>
      ) : null}
    </div>
  );
}

function WordMemoryRecalculationDialog({
  actor,
}: {
  readonly actor: WordMemoryActor;
}) {
  const snapshot = useSelector(actor, (current) => current);
  const preview = snapshot.context.recalculationPreview;
  const applying = snapshot.value === "ApplyingRecalculation";
  const open = snapshot.value === "ConfirmingRecalculation" || applying;

  return (
    <AlertDialog.Root
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen && !applying) {
          actor.trigger.cancelRecalculation();
        }
      }}
    >
      <AlertDialog.Portal>
        <AlertDialog.Backdrop className={dialogBackdropClassName} />
        <AlertDialog.Popup className={dialogPopupClassName}>
          <div className="grid gap-2">
            <AlertDialog.Title className="text-xl font-black">
              Recalculate all schedules?
            </AlertDialog.Title>
            <AlertDialog.Description className="text-sm font-semibold leading-6 text-ink-muted">
              Practice history will remain unchanged. Correct answers made
              before a word was due will be treated as free practice when its
              memory state is rebuilt.
            </AlertDialog.Description>
          </div>
          {preview === undefined ? null : (
            <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              <RecalculationStat
                label="Words changed"
                value={`${preview.changedWordCount} of ${preview.wordCount}`}
              />
              <RecalculationStat
                label="Early reviews"
                value={`${preview.reclassifiedEventCount}`}
              />
              <RecalculationStat
                label="Practice attempts"
                value={`${preview.practiceEventCount}`}
              />
              <RecalculationStat
                label="Due now"
                value={`${preview.dueNowBeforeCount} → ${preview.dueNowAfterCount}`}
              />
              <RecalculationStat
                label="Due within 7 days"
                value={`${preview.dueWithinSevenDaysBeforeCount} → ${preview.dueWithinSevenDaysAfterCount}`}
              />
              <RecalculationStat
                label="Median stability"
                value={`${_formatStability({ stability: preview.medianStabilityBefore })} → ${_formatStability({ stability: preview.medianStabilityAfter })}`}
              />
            </dl>
          )}
          {snapshot.context.message === undefined ? null : (
            <p className="text-sm font-bold leading-6 text-accent">
              {snapshot.context.message}
            </p>
          )}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <AlertDialog.Close
              className={quietButtonClassName}
              disabled={applying}
            >
              {preview?.changedWordCount === 0 ? "Close" : "Cancel"}
            </AlertDialog.Close>
            {preview?.changedWordCount === 0 ? null : (
              <Button
                type="button"
                className={primaryButtonClassName}
                disabled={applying}
                focusableWhenDisabled
                onClick={() => {
                  actor.trigger.applyRecalculation();
                }}
              >
                {applying ? (
                  <LoaderCircle
                    className="animate-spin"
                    size={16}
                    strokeWidth={2.5}
                  />
                ) : (
                  <Check size={16} strokeWidth={2.5} />
                )}
                {applying ? "Recalculating" : "Apply recalculation"}
              </Button>
            )}
          </div>
        </AlertDialog.Popup>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}

function RecalculationStat({
  label,
  value,
}: {
  readonly label: string;
  readonly value: string;
}) {
  return (
    <div className="rounded-md border border-line bg-field px-3 py-3">
      <dt className="text-[0.65rem] font-black uppercase tracking-wide text-ink-muted">
        {label}
      </dt>
      <dd className="mt-1 text-sm font-black tabular-nums text-ink">{value}</dd>
    </div>
  );
}

const _formatStability = ({ stability }: { readonly stability: number }) =>
  stability < 1
    ? `${Math.max(0, Math.round(stability * 24))}h`
    : `${Math.round(stability)}d`;

function WordMemoryTabs({ actor }: { readonly actor: WordMemoryActor }) {
  const groups = useSelector(actor, (snapshot) => snapshot.context.groups);
  const message = useSelector(actor, (snapshot) => snapshot.context.message);
  const notice = useSelector(actor, (snapshot) => snapshot.context.notice);
  const selectedStatus = useSelector(
    actor,
    (snapshot) => snapshot.context.selectedStatus
  );
  const machineState = useSelector(actor, (snapshot) => snapshot.value);
  const recalculationActive =
    machineState === "CalculatingRecalculationPreview" ||
    machineState === "ConfirmingRecalculation" ||
    machineState === "ApplyingRecalculation";

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
        aria-label="Word memory status"
        className="memory-status-tabs flex w-full min-w-0 snap-x snap-mandatory scroll-px-1 gap-2 overflow-x-auto pb-1 sm:grid sm:grid-cols-5"
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
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          {notice === undefined ? null : (
            <p className="text-sm font-black text-teal">{notice}</p>
          )}
          {message === undefined ? null : (
            <p className="text-sm font-black text-accent">{message}</p>
          )}
        </div>
        <Button
          type="button"
          className={`${secondaryButtonClassName} shrink-0`}
          disabled={recalculationActive}
          focusableWhenDisabled
          onClick={() => {
            actor.trigger.requestRecalculation();
          }}
        >
          {machineState === "CalculatingRecalculationPreview" ? (
            <LoaderCircle
              className="animate-spin"
              size={16}
              strokeWidth={2.5}
            />
          ) : (
            <RefreshCw size={16} strokeWidth={2.5} />
          )}
          {machineState === "CalculatingRecalculationPreview"
            ? "Calculating"
            : "Recalculate schedules"}
        </Button>
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
  const reviewDate = formatDateTime({ dateTime: word.state.dueAt });
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
      </div>
      <div className="grid min-w-0 justify-items-end gap-1 justify-self-end text-right">
        <p className="whitespace-nowrap text-sm font-normal text-ink">
          {retention}% recall
        </p>
        <p className="max-w-[48vw] wrap-break-word text-xs font-normal leading-5 text-ink-muted sm:max-w-72">
          {reviewDate}
        </p>
        <p className="text-xs font-normal leading-5 text-ink-muted">
          {stability}
        </p>
      </div>
    </article>
  );
}
