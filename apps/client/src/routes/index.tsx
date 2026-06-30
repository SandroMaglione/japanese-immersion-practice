import { PracticeHistoryMachine } from "@jip/machines";
import { createFileRoute } from "@tanstack/react-router";
import { useMachine, useSelector } from "@xstate/react";
import { Array as EffectArray } from "effect";
import {
  CircleAlert,
  CircleCheck,
  CircleX,
  RefreshCw,
  Search,
} from "lucide-react";
import type { Actor } from "xstate";

import { RuntimeClient } from "../lib/runtime-client.ts";
import {
  diffJapaneseSentence,
  type SentenceDiffPart,
} from "../lib/sentence-diff.ts";

const historyMachine = PracticeHistoryMachine.makePracticeHistoryMachine({
  runtime: RuntimeClient,
});

type PracticeHistoryActor = Actor<typeof historyMachine>;

export const Route = createFileRoute("/")({
  component: HistoryRoute,
});

function HistoryRoute() {
  const [snapshot, , actor] = useMachine(historyMachine);

  return (
    <div className="flex flex-col gap-6">
      <section className="flex justify-center">
        <HistorySearch actor={actor} />
      </section>
      {snapshot.matches("Loading") ? (
        <div className="py-10 text-center text-sm font-bold text-ink-muted">
          Loading attempts
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
      {snapshot.matches("Ready") ? <HistoryList actor={actor} /> : null}
    </div>
  );
}

function HistorySearch({ actor }: { readonly actor: PracticeHistoryActor }) {
  const query = useSelector(actor, (snapshot) => snapshot.context.query);

  return (
    <label className="relative w-full max-w-xl">
      <Search
        aria-hidden="true"
        className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-ink-muted"
        size={18}
        strokeWidth={2.5}
      />
      <input
        autoComplete="off"
        className="h-12 w-full rounded-md border border-line bg-field pl-11 pr-4 text-base font-bold outline-none transition placeholder:text-ink-muted/70 focus:border-ink-muted"
        placeholder="Search attempts"
        type="search"
        value={query}
        onChange={(event) => {
          actor.trigger.changeQuery({
            query: event.currentTarget.value,
          });
        }}
      />
    </label>
  );
}

function HistoryList({ actor }: { readonly actor: PracticeHistoryActor }) {
  const attempts = useSelector(
    actor,
    (snapshot) => snapshot.context.matchingAttempts
  );

  if (!EffectArray.isReadonlyArrayNonEmpty(attempts)) {
    return (
      <div className="py-14 text-center">
        <div className="text-lg font-black">No attempts found</div>
        <div className="mt-2 text-sm font-semibold text-ink-muted">
          Import JSON or adjust the search text.
        </div>
      </div>
    );
  }

  return (
    <section>
      <div className="divide-y divide-line">
        {attempts.map((view) => {
          const correction = view.attempt.correction;
          const sentenceDiff =
            correction === undefined
              ? undefined
              : diffJapaneseSentence({
                  original: view.attempt.response,
                  rewrite: correction,
                });
          const result =
            view.attempt.result === "correct"
              ? {
                  icon: CircleCheck,
                  label: "Correct",
                  textColor: "text-sky",
                }
              : view.attempt.result === "usable"
                ? {
                    icon: CircleAlert,
                    label: "Usable",
                    textColor: "text-gold",
                  }
                : {
                    icon: CircleX,
                    label: "Incorrect",
                    textColor: "text-berry",
                  };
          const ResultIcon = result.icon;

          return (
            <article
              key={view.attempt.id}
              className="grid grid-cols-[minmax(0,1fr)_auto] gap-4 px-3 py-8 sm:px-4"
            >
              <div className="min-w-0">
                <p className="wrap-break-word whitespace-pre-wrap text-lg font-black leading-7 sm:text-xl sm:leading-8">
                  {sentenceDiff === undefined ? (
                    view.attempt.response
                  ) : (
                    <SentenceDiffText
                      isUnstable={view.attempt.result === "usable"}
                      parts={sentenceDiff.original}
                      tone="original"
                    />
                  )}
                </p>
                <p className="mt-2 wrap-break-word text-sm font-semibold leading-6 text-ink-muted">
                  {view.attempt.sentence}
                </p>
                {view.attempt.correction !== undefined ||
                view.attempt.reason !== undefined ? (
                  <div className="mt-3">
                    {view.attempt.correction !== undefined ? (
                      <p className="wrap-break-word whitespace-pre-wrap text-base font-bold leading-7 text-ink sm:text-lg">
                        {sentenceDiff === undefined ? (
                          view.attempt.correction
                        ) : (
                          <SentenceDiffText
                            parts={sentenceDiff.rewrite}
                            tone="rewrite"
                          />
                        )}
                      </p>
                    ) : null}
                    {view.attempt.reason !== undefined ? (
                      <p className="mt-2 wrap-break-word text-sm font-semibold leading-6 text-ink-muted">
                        {view.attempt.reason}
                      </p>
                    ) : null}
                  </div>
                ) : null}
              </div>
              <ResultIcon
                aria-label={result.label}
                className={`mt-1 ${result.textColor}`}
                role="img"
                size={24}
                strokeWidth={2.5}
              />
            </article>
          );
        })}
      </div>
    </section>
  );
}

function SentenceDiffText({
  isUnstable = false,
  parts,
  tone,
}: {
  readonly isUnstable?: boolean;
  readonly parts: readonly SentenceDiffPart[];
  readonly tone: "original" | "rewrite";
}) {
  return (
    <>
      {parts.map((part, index) => (
        <span
          key={`${index}:${part.changeId ?? "same"}`}
          className={
            part.changed
              ? tone === "original"
                ? isUnstable
                  ? "box-decoration-clone rounded-sm bg-gold-soft px-0.5 py-px text-gold"
                  : "box-decoration-clone rounded-sm bg-accent-soft px-0.5 py-px text-accent"
                : "box-decoration-clone rounded-sm bg-sky/15 px-0.5 py-px text-sky"
              : undefined
          }
        >
          {part.text}
        </span>
      ))}
    </>
  );
}
