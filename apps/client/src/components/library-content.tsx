import { LibraryMachine } from "@jip/machines";
import { useMachine } from "@xstate/react";
import { Array as EffectArray } from "effect";
import { Save } from "lucide-react";

import { formatDateTime } from "../lib/format.ts";
import { RuntimeClient } from "../lib/runtime-client.ts";
import { KanjiWordText } from "./kanji-word-text.tsx";

const libraryMachine = LibraryMachine.makeLibraryMachine({
  runtime: RuntimeClient,
});

export function KanjiLibraryContent() {
  const [snapshot, , actor] = useMachine(libraryMachine);
  const savingKanji = snapshot.matches("SavingKanji");

  return (
    <div className="flex flex-col gap-6">
      {snapshot.context.message === undefined ? null : (
        <div className="py-3 text-sm font-black text-ink-muted">
          {snapshot.context.message}
        </div>
      )}
      <section className="divide-y divide-line">
        <form className="pb-6">
          <div className="grid gap-4">
            <label className="grid gap-2">
              <span className="text-sm font-black">Kanji</span>
              <input
                className="h-11 rounded-md border border-line bg-field px-3 text-lg font-black outline-none transition focus:border-ink-muted"
                value={snapshot.context.kanjiSymbol}
                onChange={(event) => {
                  actor.trigger.changeKanjiSymbol({
                    symbol: event.currentTarget.value,
                  });
                }}
              />
            </label>
            <label className="grid gap-2">
              <span className="text-sm font-black">Readings</span>
              <input
                className="h-11 rounded-md border border-line bg-field px-3 text-sm font-bold outline-none transition placeholder:text-ink-muted/70 focus:border-ink-muted"
                placeholder="た, だ"
                value={snapshot.context.kanjiReadings}
                onChange={(event) => {
                  actor.trigger.changeKanjiReadings({
                    readings: event.currentTarget.value,
                  });
                }}
              />
            </label>
            <label className="grid gap-2">
              <span className="text-sm font-black">Note</span>
              <textarea
                className="min-h-28 resize-y rounded-md border border-line bg-field px-3 py-3 text-sm font-semibold leading-6 outline-none transition focus:border-ink-muted"
                value={snapshot.context.kanjiDescription}
                onChange={(event) => {
                  actor.trigger.changeKanjiDescription({
                    description: event.currentTarget.value,
                  });
                }}
              />
            </label>
            <button
              type="button"
              className="inline-flex h-10 w-fit items-center gap-2 rounded-md bg-action px-4 text-sm font-black text-action-ink transition hover:bg-action-hover disabled:opacity-50"
              disabled={savingKanji}
              onClick={() => {
                actor.trigger.saveKanji();
              }}
            >
              <Save size={16} strokeWidth={2.5} />
              {savingKanji ? "Saving" : "Save kanji"}
            </button>
          </div>
        </form>
        <div className="pt-6">
          {!EffectArray.isReadonlyArrayNonEmpty(
            snapshot.context.kanjiEntries
          ) ? (
            <div className="py-6 text-sm font-bold text-ink-muted">
              No kanji saved yet.
            </div>
          ) : (
            <div className="divide-y divide-line">
              {snapshot.context.kanjiEntries.map((entry) => (
                <article key={entry.symbol} className="grid gap-2 py-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="text-3xl font-black">{entry.symbol}</div>
                    <div className="text-right text-xs font-bold text-ink-muted">
                      {formatDateTime({ dateTime: entry.updatedAt })}
                    </div>
                  </div>
                  <div className="text-sm font-black text-accent">
                    {entry.readings.join(" / ")}
                  </div>
                  <p className="text-sm font-semibold leading-6 text-ink-muted">
                    {entry.description}
                  </p>
                </article>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

export function WordLibraryContent() {
  const [snapshot, , actor] = useMachine(libraryMachine);
  const savingWord = snapshot.matches("SavingWord");

  return (
    <div className="flex flex-col gap-6">
      {snapshot.context.message === undefined ? null : (
        <div className="py-3 text-sm font-black text-ink-muted">
          {snapshot.context.message}
        </div>
      )}
      <section className="divide-y divide-line">
        <form className="pb-6">
          <div className="grid gap-4">
            <label className="grid gap-2">
              <span className="text-sm font-black">Word</span>
              <input
                className="h-11 rounded-md border border-line bg-field px-3 text-lg font-black outline-none transition focus:border-ink-muted"
                value={snapshot.context.wordText}
                onChange={(event) => {
                  actor.trigger.changeWordText({
                    text: event.currentTarget.value,
                  });
                }}
              />
            </label>
            <label className="grid gap-2">
              <span className="text-sm font-black">Translation</span>
              <input
                className="h-11 rounded-md border border-line bg-field px-3 text-sm font-bold outline-none transition focus:border-ink-muted"
                value={snapshot.context.wordTranslation}
                onChange={(event) => {
                  actor.trigger.changeWordTranslation({
                    translation: event.currentTarget.value,
                  });
                }}
              />
            </label>
            <label className="grid gap-2">
              <span className="text-sm font-black">Note</span>
              <textarea
                className="min-h-28 resize-y rounded-md border border-line bg-field px-3 py-3 text-sm font-semibold leading-6 outline-none transition focus:border-ink-muted"
                value={snapshot.context.wordDescription}
                onChange={(event) => {
                  actor.trigger.changeWordDescription({
                    description: event.currentTarget.value,
                  });
                }}
              />
            </label>
            <button
              type="button"
              className="inline-flex h-10 w-fit items-center gap-2 rounded-md bg-action px-4 text-sm font-black text-action-ink transition hover:bg-action-hover disabled:opacity-50"
              disabled={savingWord}
              onClick={() => {
                actor.trigger.saveWord();
              }}
            >
              <Save size={16} strokeWidth={2.5} />
              {savingWord ? "Saving" : "Save word"}
            </button>
          </div>
        </form>
        <div className="pt-6">
          {!EffectArray.isReadonlyArrayNonEmpty(
            snapshot.context.wordEntries
          ) ? (
            <div className="py-6 text-sm font-bold text-ink-muted">
              No words saved yet.
            </div>
          ) : (
            <div className="divide-y divide-line">
              {snapshot.context.wordEntries.map((entry) => (
                <article key={entry.text} className="grid gap-2 py-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="text-xl font-black">
                        <KanjiWordText
                          kanjiEntries={snapshot.context.kanjiEntries}
                          text={entry.text}
                        />
                      </div>
                      <div className="text-sm font-black text-accent">
                        {entry.translation}
                      </div>
                    </div>
                    <div className="text-right text-xs font-bold text-ink-muted">
                      {formatDateTime({ dateTime: entry.updatedAt })}
                    </div>
                  </div>
                  {entry.description === undefined ? null : (
                    <p className="text-sm font-semibold leading-6 text-ink-muted">
                      {entry.description}
                    </p>
                  )}
                </article>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
