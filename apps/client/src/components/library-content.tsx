import { AlertDialog } from "@base-ui/react/alert-dialog";
import { Button } from "@base-ui/react/button";
import { Checkbox } from "@base-ui/react/checkbox";
import { Field } from "@base-ui/react/field";
import { Form } from "@base-ui/react/form";
import { Tabs } from "@base-ui/react/tabs";
import { Tooltip } from "@base-ui/react/tooltip";
import { LibraryMachine } from "@jip/machines";
import { useMachine } from "@xstate/react";
import { Array as EffectArray } from "effect";
import {
  Archive,
  ArchiveRestore,
  BookPlus,
  Check,
  Copy,
  LoaderCircle,
  Minus,
  Pencil,
  Save,
  Trash2,
  Upload,
  X,
} from "lucide-react";

import { formatDateTime } from "../lib/format.ts";
import { RuntimeClient } from "../lib/runtime-client.ts";
import { WordText } from "./word-text.tsx";

const libraryMachine = LibraryMachine.makeLibraryMachine({
  runtime: RuntimeClient,
});

const fieldControlClassName =
  "h-11 w-full min-w-0 rounded-md border border-line bg-field px-3 outline-none transition focus:border-ink-muted disabled:opacity-60";

const textAreaControlClassName =
  "w-full min-w-0 resize-y rounded-md border border-line bg-field px-3 py-3 outline-none transition focus:border-ink-muted disabled:opacity-60";

const quietButtonClassName =
  "h-10 rounded-md px-4 text-sm font-black text-ink-muted transition hover:bg-field hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky disabled:opacity-50";

const primaryButtonClassName =
  "inline-flex h-10 items-center justify-center gap-2 rounded-md bg-action px-4 text-sm font-black text-action-ink transition hover:bg-action-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky disabled:opacity-50";

const secondaryButtonClassName =
  "inline-flex h-10 min-w-0 items-center justify-center gap-2 rounded-md border border-line bg-panel px-4 text-sm font-black text-ink-muted transition hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky disabled:opacity-50";

const iconButtonClassName =
  "inline-flex size-9 items-center justify-center rounded-md border border-line bg-panel text-ink-muted transition hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky disabled:opacity-50";

const tooltipPopupClassName =
  "rounded-md border border-line bg-panel px-2 py-1 text-xs font-black text-ink shadow-[0_12px_35px_rgba(0,0,0,0.35)]";

const dialogBackdropClassName = "fixed inset-0 bg-paper/70 backdrop-blur-sm";

const dialogPopupClassName =
  "fixed left-1/2 top-1/2 grid w-[min(calc(100vw-2rem),28rem)] -translate-x-1/2 -translate-y-1/2 gap-5 rounded-md border border-line bg-panel p-5 text-ink shadow-[0_24px_80px_rgba(0,0,0,0.45)] focus:outline-none";

const _entryTabClassName = ({ active }: { readonly active: boolean }) =>
  `inline-flex h-10 min-w-0 flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-md px-1.5 text-sm font-black transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky disabled:opacity-50 sm:gap-2 sm:px-3 ${
    active
      ? "bg-action text-action-ink hover:bg-action-hover"
      : "text-ink-muted hover:bg-field hover:text-ink"
  }`;

function WordSelectionCheckbox({
  checked,
  disabled,
  indeterminate = false,
  label,
  onChange,
}: {
  readonly checked: boolean;
  readonly disabled: boolean;
  readonly indeterminate?: boolean;
  readonly label: string;
  readonly onChange: () => void;
}) {
  return (
    <Checkbox.Root
      aria-label={label}
      checked={checked}
      className="inline-flex size-6 shrink-0 items-center justify-center rounded border border-line bg-panel text-action transition hover:border-ink-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky disabled:opacity-50 data-[checked]:border-action data-[checked]:bg-action data-[checked]:text-action-ink data-[indeterminate]:border-action data-[indeterminate]:bg-action data-[indeterminate]:text-action-ink"
      disabled={disabled}
      indeterminate={indeterminate}
      onCheckedChange={onChange}
    >
      <Checkbox.Indicator className="inline-flex items-center justify-center">
        {indeterminate ? (
          <Minus aria-hidden="true" size={15} strokeWidth={3} />
        ) : (
          <Check aria-hidden="true" size={15} strokeWidth={3} />
        )}
      </Checkbox.Indicator>
    </Checkbox.Root>
  );
}

export function WordLibraryContent() {
  const [snapshot, , actor] = useMachine(libraryMachine);
  const archiveAction = snapshot.context.archiveAction;
  const bulkDeleteConfirmation = snapshot.context.bulkDeleteConfirmation;
  const deleteSelectionIncludesAllWords =
    snapshot.context.deleteSelectionIncludesAllWords;
  const confirmingAllWordsDeletion = snapshot.matches(
    "ConfirmingAllWordsDeletion"
  );
  const confirmingArchiveWords = snapshot.matches("ConfirmingArchiveWords");
  const confirmingSelectedWordsDeletion = snapshot.matches(
    "ConfirmingSelectedWordsDeletion"
  );
  const confirmingWordDeletion = snapshot.matches("ConfirmingWordDeletion");
  const changingWordArchive = snapshot.matches("ChangingWordArchive");
  const deletingAllWords = snapshot.matches("DeletingAllWords");
  const deletingSelectedWords = snapshot.matches("DeletingSelectedWords");
  const deletingWord = snapshot.matches("DeletingWord");
  const exportingWords = snapshot.matches("ExportingWords");
  const importingExamples = snapshot.matches("ImportingExamples");
  const importingWords = snapshot.matches("ImportingWords");
  const savingWord = snapshot.matches("SavingWord");
  const updatingWord = snapshot.matches("UpdatingWord");
  const hasWordEntries = EffectArray.isReadonlyArrayNonEmpty(
    snapshot.context.wordEntries
  );
  const selectedWordCount = snapshot.context.selectedWordIds.length;
  const allWordsSelected =
    hasWordEntries && selectedWordCount === snapshot.context.wordEntries.length;
  const someWordsSelected = selectedWordCount > 0;
  const activeSelectedWordCount = snapshot.context.selectedWordIds.filter(
    (wordId) =>
      snapshot.context.wordEntries.some(
        (word) => word.id === wordId && word.archivedAt === undefined
      )
  ).length;
  const pendingWordEntries = snapshot.context.pendingWordIds.flatMap(
    (wordId) => {
      const word = snapshot.context.wordEntries.find(
        (entry) => entry.id === wordId
      );

      return word === undefined ? [] : [word];
    }
  );
  const bulkWordActionActive =
    confirmingArchiveWords ||
    confirmingSelectedWordsDeletion ||
    changingWordArchive ||
    deletingSelectedWords ||
    exportingWords;
  const wordDeletionActive =
    confirmingAllWordsDeletion ||
    confirmingSelectedWordsDeletion ||
    confirmingWordDeletion ||
    deletingAllWords ||
    deletingSelectedWords ||
    deletingWord;
  const wordExportCopied = snapshot.matches({ Ready: "Copied" });

  return (
    <Tabs.Root
      className="flex flex-col gap-6"
      value={snapshot.context.wordView}
      onValueChange={(value) => {
        if (value !== "batch" && value !== "examples" && value !== "single") {
          return;
        }

        actor.trigger.selectWordView({ view: value });
      }}
    >
      <Tabs.List
        aria-label="Word entry mode"
        className="flex min-w-0 rounded-md border border-line bg-panel p-1"
      >
        <Tabs.Tab
          value="batch"
          className={_entryTabClassName}
          disabled={wordDeletionActive}
        >
          <Upload aria-hidden="true" size={16} strokeWidth={2.5} />
          <span className="sm:hidden">Import</span>
          <span className="hidden sm:inline">New words</span>
        </Tabs.Tab>
        <Tabs.Tab
          value="examples"
          className={_entryTabClassName}
          disabled={wordDeletionActive}
        >
          <BookPlus aria-hidden="true" size={16} strokeWidth={2.5} />
          <span className="sm:hidden">Examples</span>
          <span className="hidden sm:inline">Add examples</span>
        </Tabs.Tab>
        <Tabs.Tab
          value="single"
          className={_entryTabClassName}
          disabled={wordDeletionActive}
        >
          <Save aria-hidden="true" size={16} strokeWidth={2.5} />
          <span className="sm:hidden">Single</span>
          <span className="hidden sm:inline">Single word</span>
        </Tabs.Tab>
      </Tabs.List>
      {snapshot.context.message === undefined ? null : (
        <div className="py-3 text-sm font-black text-ink-muted" role="status">
          {snapshot.context.message}
        </div>
      )}
      <section className="divide-y divide-line">
        <Tabs.Panel value="batch">
          <Form
            className="pb-6"
            onSubmit={(event) => {
              event.preventDefault();
              actor.trigger.importWords();
            }}
          >
            <div className="grid gap-4">
              <Field.Root
                className="grid gap-2"
                disabled={importingWords || wordDeletionActive}
              >
                <Field.Label className="text-sm font-black">JSON</Field.Label>
                <Field.Control
                  render={<textarea />}
                  className={`${textAreaControlClassName} min-h-80 font-mono text-sm leading-6 placeholder:text-ink-muted/70`}
                  disabled={importingWords || wordDeletionActive}
                  placeholder={LibraryMachine.WordImportJsonExample}
                  value={snapshot.context.wordImportJsonText}
                  onValueChange={(jsonText) => {
                    actor.trigger.changeWordImportJsonText({
                      jsonText,
                    });
                  }}
                />
              </Field.Root>
              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <Button
                  type="button"
                  className={quietButtonClassName}
                  disabled={importingWords || wordDeletionActive}
                  focusableWhenDisabled
                  onClick={() => {
                    actor.trigger.resetWordImport();
                  }}
                >
                  Clear
                </Button>
                <Button
                  type="submit"
                  className={primaryButtonClassName}
                  disabled={importingWords || wordDeletionActive}
                  focusableWhenDisabled
                >
                  <Upload size={16} strokeWidth={2.5} />
                  {importingWords ? "Importing" : "Import"}
                </Button>
              </div>
            </div>
          </Form>
        </Tabs.Panel>
        <Tabs.Panel value="examples">
          <Form
            className="pb-6"
            onSubmit={(event) => {
              event.preventDefault();
              actor.trigger.importExamples();
            }}
          >
            <div className="grid gap-4">
              <Field.Root
                className="grid gap-2"
                disabled={importingExamples || wordDeletionActive}
              >
                <Field.Label className="text-sm font-black">
                  Example JSON
                </Field.Label>
                <Field.Control
                  render={<textarea />}
                  className={`${textAreaControlClassName} min-h-80 font-mono text-sm leading-6 placeholder:text-ink-muted/70`}
                  disabled={importingExamples || wordDeletionActive}
                  placeholder={LibraryMachine.WordExampleImportJsonExample}
                  value={snapshot.context.exampleImportJsonText}
                  onValueChange={(jsonText) => {
                    actor.trigger.changeExampleImportJsonText({
                      jsonText,
                    });
                  }}
                />
              </Field.Root>
              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <Button
                  type="button"
                  className={quietButtonClassName}
                  disabled={importingExamples || wordDeletionActive}
                  focusableWhenDisabled
                  onClick={() => {
                    actor.trigger.resetExampleImport();
                  }}
                >
                  Clear
                </Button>
                <Button
                  type="submit"
                  className={primaryButtonClassName}
                  disabled={importingExamples || wordDeletionActive}
                  focusableWhenDisabled
                >
                  <BookPlus size={16} strokeWidth={2.5} />
                  {importingExamples ? "Adding" : "Add examples"}
                </Button>
              </div>
            </div>
          </Form>
        </Tabs.Panel>
        <Tabs.Panel value="single">
          <Form
            className="pb-6"
            onSubmit={(event) => {
              event.preventDefault();
              actor.trigger.saveWord();
            }}
          >
            <div className="grid gap-4">
              <Field.Root className="grid gap-2" disabled={wordDeletionActive}>
                <Field.Label className="text-sm font-black">Word</Field.Label>
                <Field.Control
                  className={`${fieldControlClassName} text-lg font-black`}
                  disabled={wordDeletionActive}
                  value={snapshot.context.wordText}
                  onValueChange={(text) => {
                    actor.trigger.changeWordText({
                      text,
                    });
                  }}
                />
              </Field.Root>
              <Field.Root className="grid gap-2" disabled={wordDeletionActive}>
                <Field.Label className="text-sm font-black">
                  Translation
                </Field.Label>
                <Field.Control
                  className={`${fieldControlClassName} text-sm font-bold`}
                  disabled={wordDeletionActive}
                  value={snapshot.context.wordTranslation}
                  onValueChange={(translation) => {
                    actor.trigger.changeWordTranslation({
                      translation,
                    });
                  }}
                />
              </Field.Root>
              <Field.Root className="grid gap-2" disabled={wordDeletionActive}>
                <Field.Label className="text-sm font-black">Note</Field.Label>
                <Field.Control
                  render={<textarea />}
                  className={`${textAreaControlClassName} min-h-28 text-sm font-semibold leading-6`}
                  disabled={wordDeletionActive}
                  value={snapshot.context.wordDescription}
                  onValueChange={(description) => {
                    actor.trigger.changeWordDescription({
                      description,
                    });
                  }}
                />
              </Field.Root>
              <Button
                type="submit"
                className={`${primaryButtonClassName} w-full sm:w-fit`}
                disabled={savingWord || wordDeletionActive}
                focusableWhenDisabled
              >
                <Save size={16} strokeWidth={2.5} />
                {savingWord ? "Saving" : "Save word"}
              </Button>
            </div>
          </Form>
        </Tabs.Panel>
        <div className="pt-6">
          {hasWordEntries ? (
            <div className="mb-4 flex min-w-0 flex-col gap-3 rounded-md border border-line bg-panel px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex w-full min-w-0 items-center justify-between gap-3 sm:w-auto">
                <div className="flex min-w-0 items-center gap-3">
                  <WordSelectionCheckbox
                    checked={allWordsSelected}
                    disabled={
                      bulkWordActionActive || wordDeletionActive || updatingWord
                    }
                    indeterminate={someWordsSelected && !allWordsSelected}
                    label={
                      allWordsSelected ? "Clear all words" : "Select all words"
                    }
                    onChange={() => {
                      actor.trigger.toggleAllWords();
                    }}
                  />
                  <Button
                    type="button"
                    aria-label={
                      allWordsSelected ? "Clear all words" : "Select all words"
                    }
                    className="min-w-0 text-left text-sm font-black text-ink-muted transition hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky disabled:opacity-50"
                    disabled={
                      bulkWordActionActive || wordDeletionActive || updatingWord
                    }
                    focusableWhenDisabled
                    onClick={() => {
                      actor.trigger.toggleAllWords();
                    }}
                  >
                    {someWordsSelected
                      ? `${selectedWordCount} selected`
                      : "Select all words"}
                  </Button>
                </div>
                {someWordsSelected ? (
                  <Button
                    type="button"
                    className={`${quietButtonClassName} w-20 sm:hidden`}
                    disabled={bulkWordActionActive}
                    focusableWhenDisabled
                    onClick={() => {
                      actor.trigger.clearWordSelection();
                    }}
                  >
                    Clear
                  </Button>
                ) : null}
              </div>
              <div
                aria-hidden={!someWordsSelected}
                className={`min-h-10 min-w-0 flex-wrap items-center gap-2 ${
                  someWordsSelected ? "flex" : "hidden sm:flex sm:invisible"
                }`}
              >
                <Tooltip.Root>
                  <Tooltip.Trigger
                    render={
                      <Button
                        type="button"
                        aria-label={`Archive ${activeSelectedWordCount} selected active ${
                          activeSelectedWordCount === 1 ? "word" : "words"
                        }`}
                        className={`${secondaryButtonClassName} w-[4.5rem] tabular-nums`}
                        disabled={
                          activeSelectedWordCount === 0 || bulkWordActionActive
                        }
                        focusableWhenDisabled
                        onClick={() => {
                          actor.trigger.archiveSelectedWords();
                        }}
                      />
                    }
                  >
                    <Archive size={16} strokeWidth={2.5} />
                    {activeSelectedWordCount}
                  </Tooltip.Trigger>
                  <Tooltip.Portal>
                    <Tooltip.Positioner sideOffset={8}>
                      <Tooltip.Popup className={tooltipPopupClassName}>
                        Archive selected words
                      </Tooltip.Popup>
                    </Tooltip.Positioner>
                  </Tooltip.Portal>
                </Tooltip.Root>
                <Tooltip.Root>
                  <Tooltip.Trigger
                    render={
                      <Button
                        type="button"
                        aria-label={`Export ${activeSelectedWordCount} selected active ${
                          activeSelectedWordCount === 1 ? "word" : "words"
                        }`}
                        className={`${secondaryButtonClassName} w-[4.5rem] tabular-nums`}
                        disabled={
                          activeSelectedWordCount === 0 || bulkWordActionActive
                        }
                        focusableWhenDisabled
                        onClick={() => {
                          actor.trigger.exportWords();
                        }}
                      />
                    }
                  >
                    {wordExportCopied ? (
                      <Check size={16} strokeWidth={2.5} />
                    ) : (
                      <Copy size={16} strokeWidth={2.5} />
                    )}
                    {activeSelectedWordCount}
                  </Tooltip.Trigger>
                  <Tooltip.Portal>
                    <Tooltip.Positioner sideOffset={8}>
                      <Tooltip.Popup className={tooltipPopupClassName}>
                        Export selected words
                      </Tooltip.Popup>
                    </Tooltip.Positioner>
                  </Tooltip.Portal>
                </Tooltip.Root>
                <Tooltip.Root>
                  <Tooltip.Trigger
                    render={
                      <Button
                        type="button"
                        aria-label={`Delete ${selectedWordCount} selected ${
                          selectedWordCount === 1 ? "word" : "words"
                        }`}
                        className={`${secondaryButtonClassName} w-[4.5rem] tabular-nums text-accent`}
                        disabled={!someWordsSelected || bulkWordActionActive}
                        focusableWhenDisabled
                        onClick={() => {
                          actor.trigger.deleteSelectedWords();
                        }}
                      />
                    }
                  >
                    <Trash2 size={16} strokeWidth={2.5} />
                    {selectedWordCount}
                  </Tooltip.Trigger>
                  <Tooltip.Portal>
                    <Tooltip.Positioner sideOffset={8}>
                      <Tooltip.Popup className={tooltipPopupClassName}>
                        Delete selected words
                      </Tooltip.Popup>
                    </Tooltip.Positioner>
                  </Tooltip.Portal>
                </Tooltip.Root>
                <Button
                  type="button"
                  className={`${quietButtonClassName} hidden w-20 items-center justify-center sm:inline-flex`}
                  disabled={!someWordsSelected || bulkWordActionActive}
                  focusableWhenDisabled
                  onClick={() => {
                    actor.trigger.clearWordSelection();
                  }}
                >
                  Clear
                </Button>
              </div>
            </div>
          ) : null}
          {!hasWordEntries ? (
            <div className="py-6 text-sm font-bold text-ink-muted">
              No words saved yet.
            </div>
          ) : (
            <div className="divide-y divide-line">
              {snapshot.context.wordEntries.map((entry) => {
                const archived = entry.archivedAt !== undefined;
                const changingThisWordArchive =
                  changingWordArchive &&
                  snapshot.context.pendingWordIds.includes(entry.id);
                const selected = snapshot.context.selectedWordIds.includes(
                  entry.id
                );
                const confirmingDeletionForWord =
                  confirmingWordDeletion &&
                  snapshot.context.deletingWordText === entry.text;
                const deletingThisWord =
                  deletingWord &&
                  snapshot.context.deletingWordText === entry.text;
                const editingWord =
                  snapshot.context.editingWordOriginalText === entry.text;
                const wordSelectionDisabled =
                  bulkWordActionActive ||
                  wordDeletionActive ||
                  updatingWord ||
                  editingWord;

                return (
                  <article
                    key={entry.text}
                    className="relative grid gap-3 py-4"
                  >
                    <div className="absolute left-1 top-5">
                      <WordSelectionCheckbox
                        checked={selected}
                        disabled={wordSelectionDisabled}
                        label={`${selected ? "Deselect" : "Select"} ${entry.text}`}
                        onChange={() => {
                          actor.trigger.toggleWordSelection({
                            wordId: entry.id,
                          });
                        }}
                      />
                    </div>
                    <div
                      className={
                        editingWord
                          ? "flex min-w-0 flex-col gap-3 pl-11 sm:flex-row sm:items-start sm:justify-between sm:gap-4"
                          : "flex min-w-0 items-start justify-between gap-4 pl-11"
                      }
                    >
                      {editingWord ? (
                        <div className="grid min-w-0 flex-1 gap-3">
                          <Field.Root
                            className="grid gap-2"
                            disabled={updatingWord}
                          >
                            <Field.Label className="text-xs font-black text-ink-muted">
                              Word
                            </Field.Label>
                            <Field.Control
                              className={`${fieldControlClassName} h-10 text-lg font-black`}
                              disabled={updatingWord}
                              value={snapshot.context.editingWordText}
                              onValueChange={(text) => {
                                actor.trigger.changeEditingWordText({
                                  text,
                                });
                              }}
                            />
                          </Field.Root>
                          <Field.Root
                            className="grid gap-2"
                            disabled={updatingWord}
                          >
                            <Field.Label className="text-xs font-black text-ink-muted">
                              Translation
                            </Field.Label>
                            <Field.Control
                              className={`${fieldControlClassName} h-10 text-sm font-bold`}
                              disabled={updatingWord}
                              value={snapshot.context.editingWordTranslation}
                              onValueChange={(translation) => {
                                actor.trigger.changeEditingWordTranslation({
                                  translation,
                                });
                              }}
                            />
                          </Field.Root>
                          <Field.Root
                            className="grid gap-2"
                            disabled={updatingWord}
                          >
                            <Field.Label className="text-xs font-black text-ink-muted">
                              Note
                            </Field.Label>
                            <Field.Control
                              render={<textarea />}
                              className={`${textAreaControlClassName} min-h-24 text-sm font-semibold leading-6`}
                              disabled={updatingWord}
                              value={snapshot.context.editingWordDescription}
                              onValueChange={(description) => {
                                actor.trigger.changeEditingWordDescription({
                                  description,
                                });
                              }}
                            />
                          </Field.Root>
                        </div>
                      ) : (
                        <div
                          className={`min-w-0 ${archived ? "opacity-55" : ""}`}
                        >
                          <Button
                            type="button"
                            aria-label={`${selected ? "Deselect" : "Select"} ${entry.text}`}
                            className="block max-w-full text-left text-xl font-black transition hover:text-ink-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky disabled:opacity-50"
                            disabled={wordSelectionDisabled}
                            focusableWhenDisabled
                            onClick={() => {
                              actor.trigger.toggleWordSelection({
                                wordId: entry.id,
                              });
                            }}
                          >
                            <WordText text={entry.text} />
                          </Button>
                          <div className="text-sm font-black text-accent">
                            {entry.translation}
                          </div>
                          <div className="mt-1 text-xs font-bold text-ink-muted">
                            {formatDateTime({ dateTime: entry.updatedAt })}
                          </div>
                          {archived ? (
                            <div className="mt-1 inline-flex items-center gap-1 text-xs font-black text-ink-muted">
                              <Archive
                                aria-hidden="true"
                                size={12}
                                strokeWidth={2.5}
                              />
                              Archived
                            </div>
                          ) : null}
                          {entry.examples === undefined ? null : (
                            <div className="mt-1 text-xs font-black text-gold">
                              {entry.examples.length}{" "}
                              {entry.examples.length === 1
                                ? "example"
                                : "examples"}
                            </div>
                          )}
                          {entry.description === undefined ? null : (
                            <p className="mt-2 text-sm font-semibold leading-6 text-ink-muted">
                              {entry.description}
                            </p>
                          )}
                        </div>
                      )}
                      <div className="flex shrink-0 items-start sm:items-center sm:self-stretch">
                        {editingWord ? (
                          <div className="flex w-full flex-col items-end gap-1 sm:w-auto sm:flex-row">
                            <Tooltip.Root>
                              <Tooltip.Trigger
                                render={
                                  <Button
                                    type="button"
                                    aria-label="Save word changes"
                                    className="inline-flex size-9 items-center justify-center rounded-md bg-action text-action-ink transition hover:bg-action-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky disabled:opacity-50"
                                    disabled={updatingWord}
                                    focusableWhenDisabled
                                    onClick={() => {
                                      actor.trigger.updateWord();
                                    }}
                                  />
                                }
                              >
                                <Check size={16} strokeWidth={2.5} />
                              </Tooltip.Trigger>
                              <Tooltip.Portal>
                                <Tooltip.Positioner sideOffset={8}>
                                  <Tooltip.Popup
                                    className={tooltipPopupClassName}
                                  >
                                    Save word changes
                                  </Tooltip.Popup>
                                </Tooltip.Positioner>
                              </Tooltip.Portal>
                            </Tooltip.Root>
                            <Tooltip.Root>
                              <Tooltip.Trigger
                                render={
                                  <Button
                                    type="button"
                                    aria-label="Cancel word edit"
                                    className={iconButtonClassName}
                                    disabled={updatingWord}
                                    focusableWhenDisabled
                                    onClick={() => {
                                      actor.trigger.cancelWordEdit();
                                    }}
                                  />
                                }
                              >
                                <X size={16} strokeWidth={2.5} />
                              </Tooltip.Trigger>
                              <Tooltip.Portal>
                                <Tooltip.Positioner sideOffset={8}>
                                  <Tooltip.Popup
                                    className={tooltipPopupClassName}
                                  >
                                    Cancel word edit
                                  </Tooltip.Popup>
                                </Tooltip.Positioner>
                              </Tooltip.Portal>
                            </Tooltip.Root>
                          </div>
                        ) : (
                          <div className="flex flex-col gap-1 sm:flex-row">
                            <Tooltip.Root>
                              <Tooltip.Trigger
                                render={
                                  <Button
                                    type="button"
                                    aria-label="Edit word"
                                    className={iconButtonClassName}
                                    disabled={
                                      changingWordArchive ||
                                      updatingWord ||
                                      wordDeletionActive
                                    }
                                    focusableWhenDisabled
                                    onClick={() => {
                                      actor.trigger.editWord({
                                        text: entry.text,
                                      });
                                    }}
                                  />
                                }
                              >
                                <Pencil size={16} strokeWidth={2.5} />
                              </Tooltip.Trigger>
                              <Tooltip.Portal>
                                <Tooltip.Positioner sideOffset={8}>
                                  <Tooltip.Popup
                                    className={tooltipPopupClassName}
                                  >
                                    Edit word
                                  </Tooltip.Popup>
                                </Tooltip.Positioner>
                              </Tooltip.Portal>
                            </Tooltip.Root>
                            <Tooltip.Root>
                              <Tooltip.Trigger
                                render={
                                  <Button
                                    type="button"
                                    aria-label={
                                      archived ? "Restore word" : "Archive word"
                                    }
                                    className={iconButtonClassName}
                                    disabled={
                                      changingWordArchive ||
                                      updatingWord ||
                                      wordDeletionActive
                                    }
                                    focusableWhenDisabled
                                    onClick={() => {
                                      if (archived) {
                                        actor.trigger.restoreWord({
                                          wordId: entry.id,
                                        });
                                        return;
                                      }

                                      actor.trigger.archiveWord({
                                        wordId: entry.id,
                                      });
                                    }}
                                  />
                                }
                              >
                                {changingThisWordArchive ? (
                                  <LoaderCircle
                                    className="animate-spin"
                                    size={16}
                                    strokeWidth={2.5}
                                  />
                                ) : archived ? (
                                  <ArchiveRestore size={16} strokeWidth={2.5} />
                                ) : (
                                  <Archive size={16} strokeWidth={2.5} />
                                )}
                              </Tooltip.Trigger>
                              <Tooltip.Portal>
                                <Tooltip.Positioner sideOffset={8}>
                                  <Tooltip.Popup
                                    className={tooltipPopupClassName}
                                  >
                                    {archived ? "Restore word" : "Archive word"}
                                  </Tooltip.Popup>
                                </Tooltip.Positioner>
                              </Tooltip.Portal>
                            </Tooltip.Root>
                            <AlertDialog.Root
                              open={
                                confirmingDeletionForWord || deletingThisWord
                              }
                              onOpenChange={(open) => {
                                if (open) {
                                  actor.trigger.deleteWord({
                                    text: entry.text,
                                  });
                                  return;
                                }

                                if (
                                  confirmingDeletionForWord &&
                                  !deletingWord
                                ) {
                                  actor.trigger.cancelWordDeletion();
                                }
                              }}
                            >
                              <Tooltip.Root>
                                <Tooltip.Trigger
                                  render={
                                    <AlertDialog.Trigger
                                      aria-label="Delete word"
                                      className={iconButtonClassName}
                                      disabled={
                                        changingWordArchive ||
                                        updatingWord ||
                                        deletingWord ||
                                        deletingAllWords ||
                                        confirmingAllWordsDeletion ||
                                        (confirmingWordDeletion &&
                                          !confirmingDeletionForWord)
                                      }
                                    />
                                  }
                                >
                                  <Trash2 size={16} strokeWidth={2.5} />
                                </Tooltip.Trigger>
                                <Tooltip.Portal>
                                  <Tooltip.Positioner sideOffset={8}>
                                    <Tooltip.Popup
                                      className={tooltipPopupClassName}
                                    >
                                      Delete word
                                    </Tooltip.Popup>
                                  </Tooltip.Positioner>
                                </Tooltip.Portal>
                              </Tooltip.Root>
                              <AlertDialog.Portal>
                                <AlertDialog.Backdrop
                                  className={dialogBackdropClassName}
                                />
                                <AlertDialog.Popup
                                  className={dialogPopupClassName}
                                >
                                  <div className="grid gap-2">
                                    <AlertDialog.Title className="text-lg font-black">
                                      Delete this word?
                                    </AlertDialog.Title>
                                    <AlertDialog.Description className="text-sm font-semibold leading-6 text-ink-muted">
                                      This removes the word from your library.
                                    </AlertDialog.Description>
                                  </div>
                                  <div className="rounded-md border border-line bg-field px-3 py-3">
                                    <div className="text-lg font-black">
                                      <WordText text={entry.text} />
                                    </div>
                                    <div className="text-sm font-black text-accent">
                                      {entry.translation}
                                    </div>
                                  </div>
                                  <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                                    <AlertDialog.Close
                                      className={quietButtonClassName}
                                      disabled={deletingThisWord}
                                    >
                                      Cancel
                                    </AlertDialog.Close>
                                    <Button
                                      type="button"
                                      className={`${primaryButtonClassName} bg-accent-soft text-accent hover:bg-accent-soft`}
                                      disabled={deletingThisWord}
                                      focusableWhenDisabled
                                      onClick={() => {
                                        actor.trigger.deleteWord({
                                          text: entry.text,
                                        });
                                      }}
                                    >
                                      <Trash2 size={16} strokeWidth={2.5} />
                                      {deletingThisWord ? "Deleting" : "Delete"}
                                    </Button>
                                  </div>
                                </AlertDialog.Popup>
                              </AlertDialog.Portal>
                            </AlertDialog.Root>
                          </div>
                        )}
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
          <AlertDialog.Root
            open={
              confirmingArchiveWords ||
              (changingWordArchive && archiveAction === "archive")
            }
            onOpenChange={(open) => {
              if (!open && confirmingArchiveWords) {
                actor.trigger.cancelArchiveWords();
              }
            }}
          >
            <AlertDialog.Portal>
              <AlertDialog.Backdrop className={dialogBackdropClassName} />
              <AlertDialog.Popup className={dialogPopupClassName}>
                <div className="grid gap-2">
                  <AlertDialog.Title className="text-lg font-black">
                    Archive {pendingWordEntries.length}{" "}
                    {pendingWordEntries.length === 1 ? "word" : "words"}?
                  </AlertDialog.Title>
                  <AlertDialog.Description className="text-sm font-semibold leading-6 text-ink-muted">
                    These words will leave practice, scheduling, statistics,
                    history, and exports. Their data will remain available if
                    restored.
                  </AlertDialog.Description>
                </div>
                <div className="grid max-h-52 gap-2 overflow-y-auto rounded-md border border-line bg-field px-3 py-3">
                  {pendingWordEntries.slice(0, 5).map((word) => (
                    <div
                      key={word.id}
                      className="flex min-w-0 items-baseline justify-between gap-3"
                    >
                      <div className="min-w-0 truncate text-base font-black">
                        <WordText text={word.text} />
                      </div>
                      <div className="min-w-0 truncate text-xs font-black text-accent">
                        {word.translation}
                      </div>
                    </div>
                  ))}
                  {pendingWordEntries.length > 5 ? (
                    <div className="text-xs font-black text-ink-muted">
                      And {pendingWordEntries.length - 5} more
                    </div>
                  ) : null}
                </div>
                <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                  <Button
                    type="button"
                    className={quietButtonClassName}
                    disabled={changingWordArchive}
                    onClick={() => {
                      actor.trigger.cancelArchiveWords();
                    }}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    className={primaryButtonClassName}
                    disabled={changingWordArchive}
                    focusableWhenDisabled
                    onClick={() => {
                      actor.trigger.confirmArchiveWords();
                    }}
                  >
                    {changingWordArchive ? (
                      <LoaderCircle
                        className="animate-spin"
                        size={16}
                        strokeWidth={2.5}
                      />
                    ) : (
                      <Archive size={16} strokeWidth={2.5} />
                    )}
                    {changingWordArchive ? "Archiving" : "Archive"}
                  </Button>
                </div>
              </AlertDialog.Popup>
            </AlertDialog.Portal>
          </AlertDialog.Root>
          <AlertDialog.Root
            open={confirmingSelectedWordsDeletion || deletingSelectedWords}
            onOpenChange={(open) => {
              if (!open && confirmingSelectedWordsDeletion) {
                actor.trigger.cancelDeleteSelectedWords();
              }
            }}
          >
            <AlertDialog.Portal>
              <AlertDialog.Backdrop className={dialogBackdropClassName} />
              <AlertDialog.Popup className={dialogPopupClassName}>
                <div className="grid gap-2">
                  <AlertDialog.Title className="text-lg font-black">
                    Permanently delete {pendingWordEntries.length}{" "}
                    {pendingWordEntries.length === 1 ? "word" : "words"}?
                  </AlertDialog.Title>
                  <AlertDialog.Description className="text-sm font-semibold leading-6 text-ink-muted">
                    Their memory states and complete practice histories will
                    also be removed. This cannot be undone.
                  </AlertDialog.Description>
                </div>
                <div className="grid max-h-52 gap-2 overflow-y-auto rounded-md border border-line bg-field px-3 py-3">
                  {pendingWordEntries.slice(0, 5).map((word) => (
                    <div
                      key={word.id}
                      className="flex min-w-0 items-baseline justify-between gap-3"
                    >
                      <div className="min-w-0 truncate text-base font-black">
                        <WordText text={word.text} />
                      </div>
                      <div className="min-w-0 truncate text-xs font-black text-accent">
                        {word.translation}
                      </div>
                    </div>
                  ))}
                  {pendingWordEntries.length > 5 ? (
                    <div className="text-xs font-black text-ink-muted">
                      And {pendingWordEntries.length - 5} more
                    </div>
                  ) : null}
                </div>
                {deleteSelectionIncludesAllWords ? (
                  <Field.Root
                    className="grid gap-2"
                    disabled={deletingSelectedWords}
                  >
                    <Field.Label className="text-sm font-black">
                      Type the confirmation phrase
                    </Field.Label>
                    <Field.Control
                      className={`${fieldControlClassName} text-sm font-bold placeholder:text-ink-muted/70`}
                      aria-label="Delete selected words confirmation"
                      disabled={deletingSelectedWords}
                      placeholder={
                        LibraryMachine.DeleteAllWordsConfirmationText
                      }
                      value={bulkDeleteConfirmation}
                      onValueChange={(confirmation) => {
                        actor.trigger.changeBulkDeleteConfirmation({
                          confirmation,
                        });
                      }}
                    />
                  </Field.Root>
                ) : null}
                <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                  <Button
                    type="button"
                    className={quietButtonClassName}
                    disabled={deletingSelectedWords}
                    onClick={() => {
                      actor.trigger.cancelDeleteSelectedWords();
                    }}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    className={`${primaryButtonClassName} bg-accent-soft text-accent hover:bg-accent-soft`}
                    disabled={
                      deletingSelectedWords ||
                      (deleteSelectionIncludesAllWords &&
                        bulkDeleteConfirmation.trim() !==
                          LibraryMachine.DeleteAllWordsConfirmationText)
                    }
                    focusableWhenDisabled
                    onClick={() => {
                      actor.trigger.confirmDeleteSelectedWords();
                    }}
                  >
                    {deletingSelectedWords ? (
                      <LoaderCircle
                        className="animate-spin"
                        size={16}
                        strokeWidth={2.5}
                      />
                    ) : (
                      <Trash2 size={16} strokeWidth={2.5} />
                    )}
                    {deletingSelectedWords ? "Deleting" : "Delete"}
                  </Button>
                </div>
              </AlertDialog.Popup>
            </AlertDialog.Portal>
          </AlertDialog.Root>
        </div>
      </section>
    </Tabs.Root>
  );
}
