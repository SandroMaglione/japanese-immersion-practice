import { AlertDialog } from "@base-ui/react/alert-dialog";
import { Button } from "@base-ui/react/button";
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
  `inline-flex h-10 min-w-0 flex-1 items-center justify-center gap-2 rounded-md px-2 text-sm font-black transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky disabled:opacity-50 sm:px-3 ${
    active
      ? "bg-action text-action-ink hover:bg-action-hover"
      : "text-ink-muted hover:bg-field hover:text-ink"
  }`;

export function WordLibraryContent() {
  const [snapshot, , actor] = useMachine(libraryMachine);
  const confirmingAllWordsDeletion = snapshot.matches(
    "ConfirmingAllWordsDeletion"
  );
  const confirmingWordDeletion = snapshot.matches("ConfirmingWordDeletion");
  const changingWordArchive = snapshot.matches("ChangingWordArchive");
  const deletingAllWords = snapshot.matches("DeletingAllWords");
  const deletingWord = snapshot.matches("DeletingWord");
  const exportingWords = snapshot.matches("ExportingWords");
  const importingExamples = snapshot.matches("ImportingExamples");
  const importingWords = snapshot.matches("ImportingWords");
  const savingWord = snapshot.matches("SavingWord");
  const updatingWord = snapshot.matches("UpdatingWord");
  const hasWordEntries = EffectArray.isReadonlyArrayNonEmpty(
    snapshot.context.wordEntries
  );
  const wordDeletionActive =
    confirmingAllWordsDeletion ||
    confirmingWordDeletion ||
    deletingAllWords ||
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
          <Upload size={16} strokeWidth={2.5} />
          New words
        </Tabs.Tab>
        <Tabs.Tab
          value="examples"
          className={_entryTabClassName}
          disabled={wordDeletionActive}
        >
          <BookPlus size={16} strokeWidth={2.5} />
          Add examples
        </Tabs.Tab>
        <Tabs.Tab
          value="single"
          className={_entryTabClassName}
          disabled={wordDeletionActive}
        >
          <Save size={16} strokeWidth={2.5} />
          Single word
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
            <div className="mb-4 flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
              <AlertDialog.Root
                open={confirmingAllWordsDeletion || deletingAllWords}
                onOpenChange={(open) => {
                  if (open) {
                    actor.trigger.deleteAllWords();
                    return;
                  }

                  if (!deletingAllWords) {
                    actor.trigger.cancelDeleteAllWords();
                  }
                }}
              >
                <AlertDialog.Trigger
                  className={secondaryButtonClassName}
                  disabled={
                    changingWordArchive ||
                    confirmingWordDeletion ||
                    deletingAllWords ||
                    deletingWord ||
                    exportingWords ||
                    importingExamples ||
                    importingWords ||
                    savingWord ||
                    updatingWord
                  }
                >
                  <Trash2 size={16} strokeWidth={2.5} />
                  {deletingAllWords ? "Deleting" : "Delete all"}
                </AlertDialog.Trigger>
                <AlertDialog.Portal>
                  <AlertDialog.Backdrop className={dialogBackdropClassName} />
                  <AlertDialog.Popup className={dialogPopupClassName}>
                    <div className="grid gap-2">
                      <AlertDialog.Title className="text-lg font-black">
                        Delete all words?
                      </AlertDialog.Title>
                      <AlertDialog.Description className="text-sm font-semibold leading-6 text-ink-muted">
                        Type the confirmation phrase to remove every word entry.
                      </AlertDialog.Description>
                    </div>
                    <Field.Root
                      className="grid gap-2"
                      disabled={deletingAllWords}
                    >
                      <Field.Label className="text-sm font-black">
                        Confirmation
                      </Field.Label>
                      <Field.Control
                        className={`${fieldControlClassName} text-sm font-bold placeholder:text-ink-muted/70`}
                        aria-label="Delete all words confirmation"
                        disabled={deletingAllWords}
                        placeholder={
                          LibraryMachine.DeleteAllWordsConfirmationText
                        }
                        value={snapshot.context.deleteAllWordsConfirmation}
                        onValueChange={(confirmation) => {
                          actor.trigger.changeDeleteAllWordsConfirmation({
                            confirmation,
                          });
                        }}
                      />
                    </Field.Root>
                    <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                      <AlertDialog.Close
                        className={quietButtonClassName}
                        disabled={deletingAllWords}
                      >
                        Cancel
                      </AlertDialog.Close>
                      <Button
                        type="button"
                        className={`${primaryButtonClassName} bg-accent-soft text-accent hover:bg-accent-soft`}
                        disabled={deletingAllWords}
                        focusableWhenDisabled
                        onClick={() => {
                          actor.trigger.deleteAllWords();
                        }}
                      >
                        <Trash2 size={16} strokeWidth={2.5} />
                        {deletingAllWords ? "Deleting" : "Delete all"}
                      </Button>
                    </div>
                  </AlertDialog.Popup>
                </AlertDialog.Portal>
              </AlertDialog.Root>
              <Button
                type="button"
                className={secondaryButtonClassName}
                disabled={
                  changingWordArchive ||
                  confirmingWordDeletion ||
                  deletingAllWords ||
                  deletingWord ||
                  exportingWords ||
                  importingExamples ||
                  importingWords ||
                  savingWord ||
                  updatingWord
                }
                focusableWhenDisabled
                onClick={() => {
                  actor.trigger.exportWords();
                }}
              >
                {wordExportCopied ? (
                  <Check size={16} strokeWidth={2.5} />
                ) : (
                  <Copy size={16} strokeWidth={2.5} />
                )}
                {exportingWords
                  ? "Exporting"
                  : wordExportCopied
                    ? "Copied"
                    : "Export word list"}
              </Button>
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
                  snapshot.context.changingArchiveWordText === entry.text;
                const confirmingDeletionForWord =
                  confirmingWordDeletion &&
                  snapshot.context.deletingWordText === entry.text;
                const deletingThisWord =
                  deletingWord &&
                  snapshot.context.deletingWordText === entry.text;
                const editingWord =
                  snapshot.context.editingWordOriginalText === entry.text;

                return (
                  <article
                    key={entry.text}
                    className={`grid gap-3 py-4 ${
                      archived ? "opacity-55" : ""
                    }`}
                  >
                    <div
                      className={
                        editingWord
                          ? "flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4"
                          : "flex min-w-0 items-start justify-between gap-4"
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
                        <div className="min-w-0">
                          <div className="text-xl font-black">
                            <WordText text={entry.text} />
                          </div>
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
                      <div className="flex shrink-0 items-center sm:self-stretch">
                        {editingWord ? (
                          <div className="flex w-full justify-end gap-1 sm:w-auto">
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
                          <div className="flex gap-1">
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
                                          text: entry.text,
                                        });
                                        return;
                                      }

                                      actor.trigger.archiveWord({
                                        text: entry.text,
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
        </div>
      </section>
    </Tabs.Root>
  );
}
