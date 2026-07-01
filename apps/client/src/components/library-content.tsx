import { LibraryMachine } from "@jip/machines";
import { useMachine } from "@xstate/react";
import { Array as EffectArray } from "effect";
import { Check, Pencil, Save, Trash2, Upload, X } from "lucide-react";

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
                className="h-11 w-full min-w-0 rounded-md border border-line bg-field px-3 text-lg font-black outline-none transition focus:border-ink-muted"
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
                className="h-11 w-full min-w-0 rounded-md border border-line bg-field px-3 text-sm font-bold outline-none transition placeholder:text-ink-muted/70 focus:border-ink-muted"
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
                className="min-h-28 w-full min-w-0 resize-y rounded-md border border-line bg-field px-3 py-3 text-sm font-semibold leading-6 outline-none transition focus:border-ink-muted"
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
              className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-md bg-action px-4 text-sm font-black text-action-ink transition hover:bg-action-hover disabled:opacity-50 sm:w-fit"
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
  const confirmingAllWordsDeletion = snapshot.matches(
    "ConfirmingAllWordsDeletion"
  );
  const confirmingWordDeletion = snapshot.matches("ConfirmingWordDeletion");
  const deletingAllWords = snapshot.matches("DeletingAllWords");
  const deletingWord = snapshot.matches("DeletingWord");
  const importingWords = snapshot.matches("ImportingWords");
  const savingWord = snapshot.matches("SavingWord");
  const updatingWord = snapshot.matches("UpdatingWord");
  const hasWordEntries = EffectArray.isReadonlyArrayNonEmpty(
    snapshot.context.wordEntries
  );
  const showingBatchImport = snapshot.context.wordView === "batch";
  const wordDeletionActive =
    confirmingAllWordsDeletion ||
    confirmingWordDeletion ||
    deletingAllWords ||
    deletingWord;

  return (
    <div className="flex flex-col gap-6">
      <div
        role="tablist"
        aria-label="Word entry mode"
        className="flex min-w-0 rounded-md border border-line bg-panel p-1"
      >
        <button
          type="button"
          role="tab"
          aria-selected={showingBatchImport}
          className={`inline-flex h-10 min-w-0 flex-1 items-center justify-center gap-2 rounded-md px-2 text-sm font-black transition sm:px-3 ${
            showingBatchImport
              ? "bg-action text-action-ink hover:bg-action-hover"
              : "text-ink-muted hover:bg-field hover:text-ink"
          }`}
          onClick={() => {
            actor.trigger.selectWordView({ view: "batch" });
          }}
          disabled={wordDeletionActive}
        >
          <Upload size={16} strokeWidth={2.5} />
          Batch import
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={!showingBatchImport}
          className={`inline-flex h-10 min-w-0 flex-1 items-center justify-center gap-2 rounded-md px-2 text-sm font-black transition sm:px-3 ${
            showingBatchImport
              ? "text-ink-muted hover:bg-field hover:text-ink"
              : "bg-action text-action-ink hover:bg-action-hover"
          }`}
          onClick={() => {
            actor.trigger.selectWordView({ view: "single" });
          }}
          disabled={wordDeletionActive}
        >
          <Save size={16} strokeWidth={2.5} />
          Single word
        </button>
      </div>
      {snapshot.context.message === undefined ? null : (
        <div className="py-3 text-sm font-black text-ink-muted">
          {snapshot.context.message}
        </div>
      )}
      <section className="divide-y divide-line">
        {showingBatchImport ? (
          <form className="pb-6">
            <div className="grid gap-4">
              <label className="grid gap-2">
                <span className="text-sm font-black">JSON</span>
                <textarea
                  className="min-h-80 w-full min-w-0 resize-y rounded-md border border-line bg-field px-3 py-3 font-mono text-sm leading-6 outline-none transition placeholder:text-ink-muted/70 focus:border-ink-muted disabled:opacity-60"
                  disabled={importingWords || wordDeletionActive}
                  placeholder={LibraryMachine.WordImportJsonExample}
                  value={snapshot.context.wordImportJsonText}
                  onChange={(event) => {
                    actor.trigger.changeWordImportJsonText({
                      jsonText: event.currentTarget.value,
                    });
                  }}
                />
              </label>
              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  className="h-10 rounded-md px-4 text-sm font-black text-ink-muted transition hover:bg-field hover:text-ink disabled:opacity-50"
                  disabled={importingWords || wordDeletionActive}
                  onClick={() => {
                    actor.trigger.resetWordImport();
                  }}
                >
                  Clear
                </button>
                <button
                  type="button"
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-action px-4 text-sm font-black text-action-ink transition hover:bg-action-hover disabled:opacity-50"
                  disabled={importingWords || wordDeletionActive}
                  onClick={() => {
                    actor.trigger.importWords();
                  }}
                >
                  <Upload size={16} strokeWidth={2.5} />
                  {importingWords ? "Importing" : "Import"}
                </button>
              </div>
            </div>
          </form>
        ) : (
          <form className="pb-6">
            <div className="grid gap-4">
              <label className="grid gap-2">
                <span className="text-sm font-black">Word</span>
                <input
                  className="h-11 w-full min-w-0 rounded-md border border-line bg-field px-3 text-lg font-black outline-none transition focus:border-ink-muted"
                  disabled={wordDeletionActive}
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
                  className="h-11 w-full min-w-0 rounded-md border border-line bg-field px-3 text-sm font-bold outline-none transition focus:border-ink-muted"
                  disabled={wordDeletionActive}
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
                  className="min-h-28 w-full min-w-0 resize-y rounded-md border border-line bg-field px-3 py-3 text-sm font-semibold leading-6 outline-none transition focus:border-ink-muted"
                  disabled={wordDeletionActive}
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
                className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-md bg-action px-4 text-sm font-black text-action-ink transition hover:bg-action-hover disabled:opacity-50 sm:w-fit"
                disabled={savingWord || wordDeletionActive}
                onClick={() => {
                  actor.trigger.saveWord();
                }}
              >
                <Save size={16} strokeWidth={2.5} />
                {savingWord ? "Saving" : "Save word"}
              </button>
            </div>
          </form>
        )}
        <div className="pt-6">
          {hasWordEntries ? (
            <div className="mb-4 flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
              <button
                type="button"
                className={`inline-flex h-10 min-w-0 items-center justify-center gap-2 rounded-md px-4 text-sm font-black transition disabled:opacity-50 ${
                  confirmingAllWordsDeletion || deletingAllWords
                    ? "bg-accent-soft text-accent hover:bg-accent-soft"
                    : "border border-line bg-panel text-ink-muted hover:text-ink"
                }`}
                disabled={
                  confirmingWordDeletion ||
                  deletingAllWords ||
                  deletingWord ||
                  importingWords ||
                  savingWord ||
                  updatingWord
                }
                onClick={() => {
                  actor.trigger.deleteAllWords();
                }}
              >
                <Trash2 size={16} strokeWidth={2.5} />
                {deletingAllWords
                  ? "Deleting"
                  : confirmingAllWordsDeletion
                    ? "Confirm"
                    : "Delete all"}
              </button>
              {confirmingAllWordsDeletion || deletingAllWords ? (
                <div className="flex min-w-0 gap-2 sm:w-96">
                  <input
                    className="h-10 min-w-0 flex-1 rounded-md border border-line bg-field px-3 text-sm font-bold outline-none transition placeholder:text-ink-muted/70 focus:border-ink-muted disabled:opacity-60"
                    aria-label="Delete all words confirmation"
                    disabled={deletingAllWords}
                    placeholder={LibraryMachine.DeleteAllWordsConfirmationText}
                    value={snapshot.context.deleteAllWordsConfirmation}
                    onChange={(event) => {
                      actor.trigger.changeDeleteAllWordsConfirmation({
                        confirmation: event.currentTarget.value,
                      });
                    }}
                  />
                  <button
                    type="button"
                    aria-label="Cancel delete all words"
                    title="Cancel delete all words"
                    className="inline-flex size-10 shrink-0 items-center justify-center rounded-md border border-line bg-panel text-ink-muted transition hover:text-ink disabled:opacity-50"
                    disabled={deletingAllWords}
                    onClick={() => {
                      actor.trigger.cancelDeleteAllWords();
                    }}
                  >
                    <X size={16} strokeWidth={2.5} />
                  </button>
                </div>
              ) : null}
            </div>
          ) : null}
          {!hasWordEntries ? (
            <div className="py-6 text-sm font-bold text-ink-muted">
              No words saved yet.
            </div>
          ) : (
            <div className="divide-y divide-line">
              {snapshot.context.wordEntries.map((entry) => {
                const confirmingDeletionForWord =
                  confirmingWordDeletion &&
                  snapshot.context.deletingWordText === entry.text;
                const editingWord =
                  snapshot.context.editingWordOriginalText === entry.text;

                return (
                  <article key={entry.text} className="grid gap-3 py-4">
                    <div
                      className={
                        editingWord
                          ? "flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4"
                          : "flex min-w-0 items-start justify-between gap-4"
                      }
                    >
                      {editingWord ? (
                        <div className="grid min-w-0 flex-1 gap-3">
                          <label className="grid gap-2">
                            <span className="text-xs font-black text-ink-muted">
                              Word
                            </span>
                            <input
                              className="h-10 w-full min-w-0 rounded-md border border-line bg-field px-3 text-lg font-black outline-none transition focus:border-ink-muted disabled:opacity-60"
                              disabled={updatingWord}
                              value={snapshot.context.editingWordText}
                              onChange={(event) => {
                                actor.trigger.changeEditingWordText({
                                  text: event.currentTarget.value,
                                });
                              }}
                            />
                          </label>
                          <label className="grid gap-2">
                            <span className="text-xs font-black text-ink-muted">
                              Translation
                            </span>
                            <input
                              className="h-10 w-full min-w-0 rounded-md border border-line bg-field px-3 text-sm font-bold outline-none transition focus:border-ink-muted disabled:opacity-60"
                              disabled={updatingWord}
                              value={snapshot.context.editingWordTranslation}
                              onChange={(event) => {
                                actor.trigger.changeEditingWordTranslation({
                                  translation: event.currentTarget.value,
                                });
                              }}
                            />
                          </label>
                          <label className="grid gap-2">
                            <span className="text-xs font-black text-ink-muted">
                              Note
                            </span>
                            <textarea
                              className="min-h-24 w-full min-w-0 resize-y rounded-md border border-line bg-field px-3 py-3 text-sm font-semibold leading-6 outline-none transition focus:border-ink-muted disabled:opacity-60"
                              disabled={updatingWord}
                              value={snapshot.context.editingWordDescription}
                              onChange={(event) => {
                                actor.trigger.changeEditingWordDescription({
                                  description: event.currentTarget.value,
                                });
                              }}
                            />
                          </label>
                        </div>
                      ) : (
                        <div className="min-w-0">
                          <div className="text-xl font-black">
                            <KanjiWordText
                              kanjiEntries={snapshot.context.kanjiEntries}
                              text={entry.text}
                            />
                          </div>
                          <div className="text-sm font-black text-accent">
                            {entry.translation}
                          </div>
                          <div className="mt-1 text-xs font-bold text-ink-muted">
                            {formatDateTime({ dateTime: entry.updatedAt })}
                          </div>
                          {entry.description === undefined ? null : (
                            <p className="mt-2 text-sm font-semibold leading-6 text-ink-muted">
                              {entry.description}
                            </p>
                          )}
                        </div>
                      )}
                      <div className="flex shrink-0 items-center sm:self-stretch">
                        {editingWord ? (
                          <div className="flex w-full justify-end gap-1 sm:w-auto">
                            <button
                              type="button"
                              aria-label="Save word changes"
                              title="Save word changes"
                              className="inline-flex size-9 items-center justify-center rounded-md bg-action text-action-ink transition hover:bg-action-hover disabled:opacity-50"
                              disabled={updatingWord}
                              onClick={() => {
                                actor.trigger.updateWord();
                              }}
                            >
                              <Check size={16} strokeWidth={2.5} />
                            </button>
                            <button
                              type="button"
                              aria-label="Cancel word edit"
                              title="Cancel word edit"
                              className="inline-flex size-9 items-center justify-center rounded-md border border-line bg-panel text-ink-muted transition hover:text-ink disabled:opacity-50"
                              disabled={updatingWord}
                              onClick={() => {
                                actor.trigger.cancelWordEdit();
                              }}
                            >
                              <X size={16} strokeWidth={2.5} />
                            </button>
                          </div>
                        ) : (
                          <div className="flex gap-1">
                            <button
                              type="button"
                              aria-label="Edit word"
                              title="Edit word"
                              className="inline-flex size-9 items-center justify-center rounded-md border border-line bg-panel text-ink-muted transition hover:text-ink disabled:opacity-50"
                              disabled={updatingWord || wordDeletionActive}
                              onClick={() => {
                                actor.trigger.editWord({ text: entry.text });
                              }}
                            >
                              <Pencil size={16} strokeWidth={2.5} />
                            </button>
                            <button
                              type="button"
                              aria-label={
                                confirmingDeletionForWord
                                  ? "Confirm delete word"
                                  : "Delete word"
                              }
                              title={
                                confirmingDeletionForWord
                                  ? "Confirm delete word"
                                  : "Delete word"
                              }
                              className={`inline-flex size-9 items-center justify-center rounded-md transition disabled:opacity-50 ${
                                confirmingDeletionForWord
                                  ? "bg-accent-soft text-accent hover:bg-accent-soft"
                                  : "border border-line bg-panel text-ink-muted hover:text-ink"
                              }`}
                              disabled={
                                updatingWord ||
                                deletingWord ||
                                deletingAllWords ||
                                confirmingAllWordsDeletion ||
                                (confirmingWordDeletion &&
                                  !confirmingDeletionForWord)
                              }
                              onClick={() => {
                                actor.trigger.deleteWord({ text: entry.text });
                              }}
                            >
                              <Trash2 size={16} strokeWidth={2.5} />
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
