import { LibraryMachine } from "@jip/machines";
import { createFileRoute } from "@tanstack/react-router";
import { useMachine } from "@xstate/react";
import { Array as EffectArray } from "effect";
import { BookOpenText, Save } from "lucide-react";

import { formatDateTime } from "../lib/format.ts";
import { RuntimeClient } from "../lib/runtime-client.ts";

const libraryMachine = LibraryMachine.makeLibraryMachine({
  runtime: RuntimeClient,
});

export const Route = createFileRoute("/library")({
  component: LibraryRoute,
});

function LibraryRoute() {
  const [snapshot, , actor] = useMachine(libraryMachine);
  const savingKanji = snapshot.matches("SavingKanji");
  const savingWord = snapshot.matches("SavingWord");

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-2">
        <h1 className="text-3xl font-black leading-tight">Library</h1>
        <p className="text-sm font-semibold leading-6 text-ink-muted">
          Add kanji, readings, words, and translations for later practice.
        </p>
      </section>
      {snapshot.context.message === undefined ? null : (
        <div className="rounded-md border border-line bg-panel p-3 text-sm font-black text-ink-muted">
          {snapshot.context.message}
        </div>
      )}
      <section className="grid gap-4 lg:grid-cols-2">
        <form className="rounded-md border border-line bg-panel p-4 sm:p-5">
          <div className="mb-4 flex items-center gap-2">
            <BookOpenText size={18} strokeWidth={2.5} />
            <h2 className="text-lg font-black">Kanji</h2>
          </div>
          <div className="grid gap-4">
            <label className="grid gap-2">
              <span className="text-sm font-black">Kanji</span>
              <input
                className="h-11 rounded-md border border-line bg-field px-3 text-lg font-black outline-none transition focus:border-ink"
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
                className="h-11 rounded-md border border-line bg-field px-3 text-sm font-bold outline-none transition placeholder:text-ink-muted/70 focus:border-ink"
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
                className="min-h-28 resize-y rounded-md border border-line bg-field px-3 py-3 text-sm font-semibold leading-6 outline-none transition focus:border-ink"
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
              className="inline-flex h-10 w-fit items-center gap-2 rounded-md border border-accent bg-accent px-4 text-sm font-black text-panel transition hover:bg-accent/90 disabled:opacity-50"
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
        <form className="rounded-md border border-line bg-panel p-4 sm:p-5">
          <div className="mb-4 flex items-center gap-2">
            <BookOpenText size={18} strokeWidth={2.5} />
            <h2 className="text-lg font-black">Word</h2>
          </div>
          <div className="grid gap-4">
            <label className="grid gap-2">
              <span className="text-sm font-black">Word</span>
              <input
                className="h-11 rounded-md border border-line bg-field px-3 text-lg font-black outline-none transition focus:border-ink"
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
                className="h-11 rounded-md border border-line bg-field px-3 text-sm font-bold outline-none transition focus:border-ink"
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
                className="min-h-28 resize-y rounded-md border border-line bg-field px-3 py-3 text-sm font-semibold leading-6 outline-none transition focus:border-ink"
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
              className="inline-flex h-10 w-fit items-center gap-2 rounded-md border border-accent bg-accent px-4 text-sm font-black text-panel transition hover:bg-accent/90 disabled:opacity-50"
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
      </section>
      <section className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-md border border-line bg-panel">
          <div className="border-b border-line px-4 py-3 text-sm font-black uppercase text-ink-muted">
            Kanji entries
          </div>
          {!EffectArray.isReadonlyArrayNonEmpty(
            snapshot.context.kanjiEntries
          ) ? (
            <div className="p-6 text-sm font-bold text-ink-muted">
              No kanji saved yet.
            </div>
          ) : (
            <div className="divide-y divide-line">
              {snapshot.context.kanjiEntries.map((entry) => (
                <article key={entry.symbol} className="grid gap-2 p-4">
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
        <div className="rounded-md border border-line bg-panel">
          <div className="border-b border-line px-4 py-3 text-sm font-black uppercase text-ink-muted">
            Word entries
          </div>
          {!EffectArray.isReadonlyArrayNonEmpty(
            snapshot.context.wordEntries
          ) ? (
            <div className="p-6 text-sm font-bold text-ink-muted">
              No words saved yet.
            </div>
          ) : (
            <div className="divide-y divide-line">
              {snapshot.context.wordEntries.map((entry) => (
                <article key={entry.text} className="grid gap-2 p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="text-xl font-black">{entry.text}</div>
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
